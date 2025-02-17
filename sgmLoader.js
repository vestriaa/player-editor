class SGMLoader extends THREE.Loader {
  constructor(manager) {
    super(manager);
    this.textDecoder = new TextDecoder();
  }  // Updated parameter list to match THREE.js loader convention
  load(file, onLoad, onProgress, onError) {
    const loader = new THREE.FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(
      file + '.sgm',
      (data) => {
        try {
          const [meshes, materials, animFilename] = this.parse(data);
          
          if (animFilename) {
            const directoryPath = file.match(/^(.*\/)/)[1];
            const sgaPath = directoryPath + animFilename.replace('*', 'sga');

            const sgaLoader = new SGALoader(this.manager);
            sgaLoader.setPath(this.path);
            sgaLoader.load(
              sgaPath,
              (sgaData) => {
                const { skeleton, clips, boneInfo } = sgaData;
                const group = this.createGroupFromMeshes(meshes, materials, true);
                
                group.traverse((child) => {
                  if (child instanceof THREE.SkinnedMesh) {
                    child.skeleton = skeleton;
                    boneInfo.forEach((info, index) => {
                      if (info.isRoot) {
                        child.add(skeleton.bones[index]);
                      }
                    });
                    child.bind(skeleton);
                  }
                });
                onLoad({ group, skeleton, clips });
              },
              onProgress,
              (err) => {
                console.error('Failed to load SGA animation:', err);
                this.manager.itemError(sgaPath);
                const group = this.createGroupFromMeshes(meshes, materials, false);
                onLoad({ group, skeleton: null, clips: null });
              }
            );
          } else {
            const group = this.createGroupFromMeshes(meshes, materials, false);
            onLoad({ group, skeleton: null, clips: null });
          }
        } catch (error) {
          if (onError) onError(error);
          else console.error(error);
          this.manager.itemError(file);
        }
      },
      onProgress,
      (err) => onError?.(err)
    );
  }

  parse(data) {
    const bufferView = new DataView(data);
    let offset = 0;

    const readUInt8 = () => bufferView.getUint8(offset++);
    const readUInt16 = () => {
      const val = bufferView.getUint16(offset, true);
      offset += 2;
      return val;
    };
    const readUInt32 = () => {
      const val = bufferView.getUint32(offset, true);
      offset += 4;
      return val;
    };
    const readFloat32 = () => {
      const val = bufferView.getFloat32(offset, true);
      offset += 4;
      return val;
    };
    const readString = () => {
      const length = readUInt16();
      const bytes = new Uint8Array(bufferView.buffer, offset, length);
      offset += length;
      return this.textDecoder.decode(bytes);
    };

    const version = [readUInt32(), readUInt8()];

    const numMaterials = readUInt8();
    const materials = [];
    for (let i = 0; i < numMaterials; i++) {
      const materialId = readUInt8();
      const uvCount = readUInt8();
      const uvData = [];

      for (let j = 0; j < uvCount; j++) {
        const imageCount = readUInt8();
        const images = [];
        for (let k = 0; k < imageCount; k++) {
          const usageHint = readUInt8();
          const texname = readString().replace('*', 'png');
          images.push([texname, usageHint]);
        }
        uvData.push(images);
      }

      const colorCount = readUInt8();
      const colors = [];
      for (let j = 0; j < colorCount; j++) {
        const colorId = readUInt8();
        colors.push([new Float32Array([readFloat32(), readFloat32(), readFloat32(), readFloat32()]), colorId]);
      }

      materials.push({
        material_id: materialId,
        uv_data: uvData,
        colors: colors,
      });
    }

    const numMeshes = readUInt8();
    const meshes = [];
    for (let i = 0; i < numMeshes; i++) {
      const meshId = readUInt8();
      const materialId = readUInt8();
      const vertexCount = readUInt32();
      const uvCount = readUInt8();
      const texdataCount = readUInt8();
      const hasTangents = readUInt8();
      const hasBones = readUInt8();

      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const colors = texdataCount === 4 ? new Float32Array(vertexCount * 4) : null;
      const tangents = hasTangents ? new Float32Array(vertexCount * 4) : null;
      const weights = hasBones ? new Float32Array(vertexCount * 4) : null;
      const bones = hasBones ? new Float32Array(vertexCount * 4) : null;

      for (let j = 0; j < vertexCount; j++) {
        positions[j * 3] = readFloat32();
        positions[j * 3 + 1] = readFloat32();
        positions[j * 3 + 2] = readFloat32();

        normals[j * 3] = readFloat32();
        normals[j * 3 + 1] = readFloat32();
        normals[j * 3 + 2] = readFloat32();

        for (let k = 0; k < uvCount; k++) {
          const u = readFloat32();
          const v = readFloat32();
          if (k === 0) {
            uvs[j * 2] = u;
            uvs[j * 2 + 1] = v;
          }
        }

        if (texdataCount === 4) {
          const base = j * 4;
          colors[base] = readFloat32();
          colors[base + 1] = readFloat32();
          colors[base + 2] = readFloat32();
          colors[base + 3] = readFloat32();
        }

        if (hasTangents) {
          const base = j * 4;
          tangents[base] = readFloat32();
          tangents[base + 1] = readFloat32();
          tangents[base + 2] = readFloat32();
          tangents[base + 3] = readFloat32();
        }

        if (hasBones) {
          const base = j * 4;
          weights[base] = readFloat32();
          weights[base + 1] = readFloat32();
          weights[base + 2] = readFloat32();
          weights[base + 3] = readFloat32();

          bones[base] = readFloat32();
          bones[base + 1] = readFloat32();
          bones[base + 2] = readFloat32();
          bones[base + 3] = readFloat32();
        }
      }

      const indexCount = readUInt32();
      const indexSize = readUInt8();
      const indices = indexSize === 4
        ? new Uint32Array(indexCount)
        : new Uint16Array(indexCount);

      for (let j = 0; j < indexCount; j++) {
        indices[j] = indexSize === 4 ? readUInt32() : readUInt16();
      }

      meshes.push({
        mesh_id: meshId,
        material_id: materialId,
        positions,
        normals,
        uvs,
        colors,
        indices,
        tangents,
        weights,
        bones
      });
    }
    const hasAnimation = readUInt8();
    let animFilename = null;
    if (hasAnimation === 1) {
      const animFilenameLength = readUInt16();
      const bytes = new Uint8Array(bufferView.buffer, offset, animFilenameLength);
      offset += animFilenameLength;
      animFilename = this.textDecoder.decode(bytes);
    }

    return [meshes, materials, animFilename];
  }

  createGroupFromMeshes(meshes, materials, useSkinning = false) {
    const group = new THREE.Group();
    const threeMaterials = [];

    for (const material of materials) {
      const color = material.colors?.[0]?.[0] || [1, 1, 1];
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().fromArray(color),
      });
      threeMaterials[material.material_id] = mat;
    }

    for (const mesh of meshes) {
      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));

      if (mesh.uvs.length > 0) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
      }

      if (mesh.colors && mesh.colors.length > 0) {
        geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 4));
        threeMaterials[mesh.material_id].vertexColors = true;
      }

      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

      if (useSkinning && mesh.weights && mesh.bones) {
        const skinWeightAttr = new THREE.Float32BufferAttribute(mesh.weights, 4);
        const skinIndexAttr = new THREE.Uint16BufferAttribute(mesh.bones, 4);
        geometry.setAttribute('skinWeight', skinWeightAttr);
        geometry.setAttribute('skinIndex', skinIndexAttr);
      }

      let threeMesh;
      if (useSkinning && mesh.weights && mesh.bones) {
        threeMesh = new THREE.SkinnedMesh(geometry, threeMaterials[mesh.material_id]);
      } else {
        threeMesh = new THREE.Mesh(geometry, threeMaterials[mesh.material_id]);
      }

      group.add(threeMesh);
    }

    return group;
  }
}