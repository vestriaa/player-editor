class Player {
    static usedPlayerNames = new Set();

    constructor(scene, itemsList, playerItems, userInput = undefined) {
        this.scene = scene;
        this.userInput = this.validatePlayerName(userInput);
        this.activeModels = {};
        this.itemsList = itemsList;
        this.pendingAttachments = {};
        
        this.defaults = {
            "head": {
                file: "player/head",
                materials: [
                    { type: "default_primary_color" },
                    { type: "default_secondary_color" },
                    { type: "default_secondary_color_visor" },
                ]
            },
            "body": {
                file: "player/body",
                materials: [
                    { type: "default_secondary_color" },
                    { type: "default_primary_color" }
                ],
            },
            "hand/left": {
                file: "player/hand_claw",
                materials: [
                    { type: "default_primary_color" },
                    { type: "default_secondary_color" }
                ]
            },
            "hand/right": {
                file: "player/hand_claw",
                materials: [
                    { type: "default_primary_color" },
                    { type: "default_secondary_color" }
                ]
            },
            "rope/left": {
                file: "player/grapple_rope",
            },
            "rope/right": {
                file: "player/grapple_rope",
            },
            "checkpoint": { file: "player/checkpoint" },
            "grapple/hook/left": { file: "player/grapple_anchor" },
            "grapple/hook/right": { file: "player/grapple_anchor" }
        };

        if (!playerItems){
            this.scene.userData[this.userInput] = {}
            this.scene.userData[this.userInput].primary_color = new THREE.Color();
            this.scene.userData[this.userInput].secondary_color = new THREE.Color(1,0,0);
        }

        this.initialized = this.initializePlayer(playerItems);


       
    }

    async initializePlayer(playerItems) {
        await this.loadDefaults();
        
        if (playerItems && Object.keys(playerItems).length > 0) {
            const loadPromises = [];
            const hasHands = playerItems.hasOwnProperty('hand');
            
            for (const itemType in playerItems) {
                if (itemType === 'hand') {
                    const target = playerItems[itemType];
                    loadPromises.push(this.loadModel(target, 'hand/left'));
                    loadPromises.push(this.loadModel(target, 'hand/right'));
                } else {
                    loadPromises.push(this.loadModel(playerItems[itemType], itemType));
                }
            }
            await Promise.all(loadPromises);
        }
    }
    validatePlayerName(name) {
        const defaultName = "defaultPlayer";
        if (!name) {
            name = defaultName;
        }
        let uniqueName = name;
        let counter = 1;
        while (Player.usedPlayerNames.has(uniqueName)) {
            uniqueName = `${name}_${counter}`;
            counter++;
        }
        Player.usedPlayerNames.add(uniqueName);
        return uniqueName;
    }

    loadDefaults() {
        const loadPromises = [];

        for (let type in this.defaults) {
            loadPromises.push(this.loadModel(this.defaults[type].file, type));
        }

        return Promise.all(loadPromises);
    }

    unequip(type) {
        return new Promise(resolve => {
            if (this.defaults[type]) {
                this.loadModel(this.defaults[type].file, type).then(resolve);
            } else {
                this.HandleModelToScene(undefined, type);
                resolve();
            }
        });
    }

    HandleModelToScene(model = undefined, itemType) {
        if (this.activeModels[itemType]) {
            this.resetAttachments(itemType);
            console.log(itemType, this.activeModels[itemType].name);
            this.scene.remove(this.activeModels[itemType]);
        }

        this.activeModels[itemType] = model;
        if (model) {
            this.scene.add(model);
        }
    }

    loadModel(targetname, itemtype) {
        return new Promise((resolve, reject) => {
            const loader = new SGMLoader();
            const item = this.itemsList[targetname]?this.itemsList[targetname]: this.defaults[itemtype];
            const file = item && item.file ? item.file : targetname;
            loader.load(file, (model) => {
                try {
                    console.log(this.userInput)
                    model = model.group;
                    model = MeshUtils.applyMaterialIndices(model, item);
                    model = MeshUtils.applyColors(this.scene, item, model, this.userInput);
                    model = MeshUtils.adjustGroupForCategory(model, itemtype);

                    model.name = targetname;
                    model.grab_type = itemtype;
                    model.player = this.userInput;

                    model = this.setupAttachments(model, item.attachment_point ? itemtype + '/' + item.attachment_point : itemtype);

                    this.HandleModelToScene(model, itemtype);
                    this.applyPendingAttachments(model, itemtype);
                    this.adjustAsChildModel(itemtype);

                    this.scene.needsUpdate = true;
                    resolve(model);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    applyPendingAttachments(model, itemtype) {
        if (this.pendingAttachments[itemtype]) {
            this.adjustAttachments(model, this.itemsList[model.name]);
            delete this.pendingAttachments[itemtype];
        }
    }

    adjustAsChildModel(itemtype) {
        for (let parentType in this.activeModels) {
            const parentModel = this.activeModels[parentType];
            const parentItem = this.itemsList[parentModel.name];
            if (parentItem && parentItem.attachment_points && parentItem.attachment_points[itemtype.split('/').pop()]) {
                this.adjustAttachments(parentModel, parentItem);
                break;
            }
        }
    }

    resetAttachments(itemtype) {
        for (let attachmentType in this.activeModels) {
            if (attachmentType.startsWith(itemtype + "/")) {
                this.activeModels[attachmentType].restore();
            }
        }
    }

    adjustAttachments(parentModel, item) {
        if (item.attachment_points) {
            for (let [attachmentType, point] of Object.entries(item.attachment_points)) {
                const fullAttachmentType = `${item.type}/${attachmentType}`;
                const childModel = this.activeModels[fullAttachmentType];

                if (childModel) {
                    this.applyAttachment(childModel, parentModel, point);
                } else {
                    this.pendingAttachments[fullAttachmentType] = { parentModel, point, attachmentType };
                }
            }
        }
        if (item.attachment_offset_v2) {
            parentModel.position.z -= (item.attachment_offset_v2);
        }
    }

    applyAttachment(childModel, parentModel, point) {
        childModel.restore();
        const override = this.itemsList[childModel.name].attachment_point_overrides?.[parentModel.name];
        if (override) {
            if (override.position) childModel.position.copy(new THREE.Vector3(...override.position));
            if (override.rotation) childModel.rotation.copy(new THREE.Vector3(...override.rotation));
            if (override.scale) childModel.scale.set(override.scale, override.scale, override.scale);
        } else if (point) {
            console.log(childModel.name, parentModel.name);
            if (point.position) {
                childModel.position.copy(new THREE.Vector3(...point.position));
                if (childModel.grab_type.includes('body')) {
                    childModel.position.y += -0.2;
                }
            }
            if (point.rotation) childModel.rotation.copy(new THREE.Euler(...point.rotation));
            if (point.scale) childModel.scale.set(point.scale, point.scale, point.scale);
        }
    }

    setupAttachments(model, type) {
        let { position, rotation } = this.handleAttachments(type);
        let initialPosition, initialRotation, initialQuaternion;

        if (rotation) {
            rotation = new THREE.Euler(
                (rotation.x * Math.PI) / 180,
                (rotation.y * Math.PI) / 180,
                (rotation.z * Math.PI) / 180
            );
            model.rotation.copy(rotation);
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(rotation);
            quaternion.x = -quaternion.x;
            quaternion.z = -quaternion.z;
            model.quaternion.copy(quaternion);
        }

        initialRotation = model.rotation.clone();
        initialQuaternion = model.quaternion.clone();

        if (position) {
            position = new THREE.Vector3(...position);
            model.position.add(position);
        }

        initialPosition = model.position.clone();

        model.restore = () => {
            if (initialPosition) {
                model.position.copy(initialPosition);
            }
            if (initialRotation) {
                model.rotation.copy(initialRotation);
            }
            model.quaternion.copy(initialQuaternion);
            model.scale.set(1, 1, 1);
            return model;
        };

        return model;
    }

    handleAttachments(type) {
        const positions = {
            "head/hat": [0.0, 0.190766, 0.0],
            "head/glasses": [0.0, 0.008302, -0.203441],
            "head/glasses/mouth": [0.0, -0.192385, -0.291841],
            "body/backpack": [0.0, -0.311955, 0.278574],
            "body/neck/chest": [0.0, -0.300416, -0.124705],
            "body/badge/left": [-0.134673, -0.267122, -0.088314],
            "body/badge/right": [0.134673, -0.267122, -0.088314],
        };

        const rotations = {
            "body/badge/left": [15.4997, -1.23764, 0.0],
            "body/badge/right": [-15.4997, -1.23764, 0.0]
        };

        return { position: positions[type] || null, rotation: rotations[type] || null };
    }

    dispose() {
        Object.values(this.activeModels).forEach(model => this.scene.remove(model));
    }
}
