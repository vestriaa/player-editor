class MeshUtils {

  static halfColor(color) {
    return color.multiplyScalar(0.5);
  }

  static getColorFromInput(colorInput) {
    return colorInput instanceof THREE.Color
      ? colorInput
      : new THREE.Color(...(Array.isArray(colorInput) ? colorInput : [colorInput]));
  }

  static applyColors(scene, item, group, userInput) {
    const primaryColor = MeshUtils.getColorFromInput(scene.userData[userInput].primary_color);
    const secondaryColor = MeshUtils.getColorFromInput(scene.userData[userInput].secondary_color);

    const colorMap = {
      default_color: (index) => new THREE.Color(...item.materials[index].diffuseColor),
      default_primary_color: () => primaryColor,
      default_secondary_color: () => secondaryColor,
      default_secondary_color_visor: () => MeshUtils.halfColor(secondaryColor.clone()),
      default_secondary_color_darkened: () => MeshUtils.halfColor(secondaryColor.clone()),
      default_primary_color_darkened: () => MeshUtils.halfColor(primaryColor.clone()),
      default_primary_color_visor: () => MeshUtils.halfColor(primaryColor.clone()),
    };

    group.traverse((obj) => {
      if (obj.material && colorMap[obj.name]) {
        obj.material.color.set(colorMap[obj.name](group.children.indexOf(obj)));
      }
    });

    return group;
  }
  static applyNormalColors(item, group) {

    const colorMap = {
      default_color: (index) => new THREE.Color(...item.materials[index].diffuseColor),
    };

    group.traverse((obj) => {
      if (obj.material && colorMap[obj.name]) {
        obj.material.color.set(colorMap[obj.name](group.children.indexOf(obj)));
      }
    });

    return group;
  }
  static applyColorsToAll(player) {
    const primaryColor = MeshUtils.getColorFromInput(player.scene.userData[player.userInput].primary_color);
    const secondaryColor = MeshUtils.getColorFromInput(player.scene.userData[player.userInput].secondary_color);

    const colorMap = {
        default_primary_color: () => primaryColor,
        default_secondary_color: () => secondaryColor,
        default_secondary_color_visor: () => MeshUtils.halfColor(secondaryColor.clone()),
        default_secondary_color_darkened: () => MeshUtils.halfColor(secondaryColor.clone()),
        default_primary_color_darkened: () => MeshUtils.halfColor(primaryColor.clone()),
        default_primary_color_visor: () => MeshUtils.halfColor(primaryColor.clone()),
    };

    for (const modelType in player.activeModels) {
        const model = player.activeModels[modelType];

        model.traverse((obj) => {
          if (obj.material && colorMap[obj.name]) {
            obj.material.color.set(colorMap[obj.name](model.children.indexOf(obj)));
          }
        });
    }
}

  static applyMaterialIndices(group, item) {
    group.children.forEach((child, index) => {
      child.name = item?.materials?.[index]?.type || item?.materials?.[index] || "default";
    });
    return group;
  }

  static adjustGroupForCategory(group, itemtype) {
    if (itemtype.includes('body')) {
      group.position.copy(new THREE.Vector3(0, -0.2, 0));

    } else if (itemtype === 'hand/left') {
        group.position.set(0.3, -0.5, -0.4);
        group.rotation.set(10 * Math.PI / 180, 0, 170 * Math.PI / 180);
    } else if (itemtype === 'hand/right') {
        group.position.set(-0.3, -0.75, -0.1);
        group.rotation.set(-45 * Math.PI / 180, 0, -190 * Math.PI / 180);
        group.scale.set(-1, 1, 1);
    } else if (itemtype === "checkpoint") {
      group.position.set(-0.5, -1.5, 0)
    } else if(itemtype == "rope/left" || itemtype === "grapple/hook/left") {
      group.position.set(0.3, -0.5, -0.4)
      group.rotation.z = 170*(Math.PI/180)
      group.rotation.x = 10*(Math.PI/180)
      group.rotation.y = 0

    } else if(itemtype == "rope/right" || itemtype === "grapple/hook/right") {

      group.position.set(-0.3, -0.75, -0.1);
      group.rotation.x = -45*(Math.PI/180)
      group.rotation.y = 0
      group.rotation.z = -190*(Math.PI/180)      
      group.scale.set(-1,1,1)  

    }
    if (itemtype.includes("grapple/hook")) {
      let offset = new THREE.Vector3(0, 0, -1)
      offset.applyQuaternion(group.quaternion)
      group.position.add(offset)
    }
    return group;
  }
}

