class SGALoader extends THREE.Loader {
    constructor(manager) {
        super(manager);
        this.textDecoder = new TextDecoder();
    }

    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setPath(this.path);
        loader.setResponseType('arraybuffer');
        loader.setRequestHeader(this.requestHeader);
        loader.setWithCredentials(this.withCredentials);

        loader.load(url, (data) => {
            try {
                const { skeleton, clips, boneInfo } = this.parse(data);
                onLoad({ skeleton, clips, boneInfo });
            } catch (e) {
                if (onError) onError(e);
                else console.error(e);
                this.manager.itemError(url);
            }
        }, onProgress, onError);
    }

    parse(data) {
        const view = new DataView(data);
        let offset = 0;

        // Read utilities
        const readU8 = () => view.getUint8(offset++);
        const readU16 = () => { const v = view.getUint16(offset, true); offset += 2; return v; };
        const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
        const readF32 = () => { const v = view.getFloat32(offset, true); offset += 4; return v; };
        const readString = (len) => {
            const bytes = new Uint8Array(data, offset, len);
            offset += len;
            const nullIndex = bytes.indexOf(0);
            return this.textDecoder.decode(bytes.slice(0, nullIndex > -1 ? nullIndex : len));
        };

        // Validate header
        const magic = readU32();
        if (magic !== 0x16DA4E5A) throw new Error('Invalid SGA file');
        const version = readU8();
        if (version !== 1) throw new Error('Unsupported SGA version');

        // Read skeleton name
        const skeletonName = readString(readU16());

        // Read bones
        const boneCount = readU16();
        const bones = [];
        const boneInfo = [];

        for (let i = 0; i < boneCount; i++) {
            const name = readString(readU16());

            // Read and convert position (exporter uses -X, Z, Y)
            const px = readF32(); // Flip X back
            const py = readF32();  // Original Z
            const pz = readF32();  // Original Y

            const isRoot = readU8() === 1;
            const childCount = readU16();
            const children = [];
            for (let c = 0; c < childCount; c++) {
                children.push(readU16());
            }

            const bone = new THREE.Bone();
            bone.name = name;
            bone.position.set(px, py, pz); 
            bone.quaternion.identity();
            bone.scale.set(1, 1, 1);
            bone.updateMatrix();

            bones.push(bone);
            boneInfo.push({ children, isRoot });
        }

        // Build hierarchy
        for (let i = 0; i < boneCount; i++) {
            const { children } = boneInfo[i];
            for (const childIdx of children) {
                if (childIdx >= bones.length) {
                    throw new Error(`Invalid child index ${childIdx} for bone ${i}`);
                }
                bones[i].add(bones[childIdx]);
            }
        }
        

        // Create skeleton
        const skeleton = new THREE.Skeleton(bones);
        skeleton.bones.forEach(bone => bone.updateMatrixWorld(true));


        const animationCount = readU16();
        const clips = [];

        for (let a = 0; a < animationCount; a++) {
            const animName = readString(readU16());
            const affectedBonesCount = readU16();
            const tracks = [];

            for (let b = 0; b < affectedBonesCount; b++) {
                const boneId = readU16();
                if (boneId >= bones.length) {
                    console.warn(`Skipping invalid bone ID ${boneId} in animation ${animName}`);
                    // Skip over this bone's animation data to maintain offset correctness
                    const frameCount = readU32();
                    // Each frame has: time (4) + position (12) + scale (12) + rotation (16) = 44 bytes
                    offset += frameCount * 44;
                    continue;
                }

                const frameCount = readU32();
                const times = new Float32Array(frameCount);
                const positions = new Float32Array(frameCount * 3);
                const scales = new Float32Array(frameCount * 3);
                const rotations = new Float32Array(frameCount * 4);

                for (let f = 0; f < frameCount; f++) {
                    times[f] = readF32() / 60;

                    positions[f * 3] = -readF32();
                    positions[f * 3 + 1] = readF32();
                    positions[f * 3 + 2] = readF32();

                    scales[f * 3] = readF32();
                    scales[f * 3 + 1] = readF32();
                    scales[f * 3 + 2] = readF32();

                    rotations[f * 4] = readF32();
                    rotations[f * 4 + 1] = readF32();
                    rotations[f * 4 + 2] = readF32();
                    rotations[f * 4 + 3] = readF32();
                }

                const bone = skeleton.bones[boneId];
                tracks.push(
                    new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, positions),
                    new THREE.VectorKeyframeTrack(`${bone.name}.scale`, times, scales),
                    new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations)
                );
            }

            if (tracks.length > 0) {
                const clip = new THREE.AnimationClip(animName, -1, tracks);
                clips.push(clip);
            } else {
                console.warn(`Animation ${animName} has no valid tracks and was skipped.`);
            }
        }
        console.log('Skeleton:', skeleton);
        console.log('Clips:', clips);
        console.log('Bone Info:', boneInfo);
        return { skeleton, clips, boneInfo };
    }
}
