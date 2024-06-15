AFRAME.registerSystem('shaderloader', {
  init: function() {
    this.frog_runtime = new ShaderRuntime();
    this.clock = new THREE.Clock();

    const scene = document.querySelector('a-scene');
    scene.addEventListener('loaded', this.registerCamera.bind(this));

    if (scene.hasLoaded) {
      this.registerCamera();
    }
  },
  registerCamera: function() {
    const cameraSystem = document.querySelector("a-scene").systems["camera"];
    if (cameraSystem && cameraSystem.sceneEl && cameraSystem.sceneEl.camera) {
      const camera = cameraSystem.sceneEl.camera;
      this.frog_runtime.registerCamera(camera);
    }
  },
  tick: function() {
    this.frog_runtime.updateShaders(this.clock.getElapsedTime());
  }
});

AFRAME.registerComponent('shaderloader', {
  schema: {
    src: { type: "asset" }
  },
  init: function() {
    this.applyShader = this.applyShader.bind(this);
    this.originalMaterials = {};

    this.el.addEventListener('model-loaded', this.applyShader);
  },
  update: function() {
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      this.applyShader();
    }
  },
  applyShader: function() {
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      this.storeOriginalMaterials(mesh);

      this.system.frog_runtime.load(this.data.src, (shaderData) => {
        const material = this.system.frog_runtime.get(shaderData.name);
        this.applyMaterialToMesh(mesh, material);
      });
    }
  },
  storeOriginalMaterials: function(mesh) {
    mesh.traverse((node) => {
      if (node.isMesh) {
        this.originalMaterials[node.uuid] = node.material;
      }
    });
  },
  applyMaterialToMesh: function(mesh, material) {
    mesh.traverse((node) => {
      if (node.isMesh) {
        node.material = material;
      }
    });
  },
  remove: function() {
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      this.restoreOriginalMaterials(mesh);
    }
    this.el.removeEventListener('model-loaded', this.applyShader);
  },
  restoreOriginalMaterials: function(mesh) {
    mesh.traverse((node) => {
      if (node.isMesh && this.originalMaterials[node.uuid]) {
        node.material = this.originalMaterials[node.uuid];
      }
    });
  }
});


let defaultThreeUniforms = [
  'normalMatrix', 'viewMatrix', 'projectionMatrix', 'position', 'normal',
  'modelViewMatrix', 'uv', 'uv2', 'modelMatrix'
];

function ShaderRuntime() {
  this.mainCamera = null;
  this.cubeCameras = {};
  this.reserved = { time: null, cameraPosition: null };
  this.umap = {
    float: { type: 'f', value: 0 },
    int: { type: 'i', value: 0 },
    vec2: { type: 'v2', value: () => new THREE.Vector2() },
    vec3: { type: 'v3', value: () => new THREE.Vector3() },
    vec4: { type: 'v4', value: () => new THREE.Vector4() },
    samplerCube: { type: 't' },
    sampler2D: { type: 't' }
  };
  this.shaderTypes = {};
  this.runningShaders = [];
}

ShaderRuntime.prototype = {
  getUmap(type) {
    const value = this.umap[type].value;
    return typeof value === 'function' ? value() : value;
  },
  load(sourceOrSources, callback) {
    const sources = Array.isArray(sourceOrSources) ? sourceOrSources : [sourceOrSources];
    const loadedShaders = [];
    let itemsLoaded = 0;

    sources.forEach((source, index) => {
      new THREE.FileLoader().load(source, (json) => {
        let parsed;
        try {
          parsed = JSON.parse(json);
          delete parsed.id;
        } catch (e) {
          throw new Error(`Could not parse shader ${source}! Please verify the URL is correct.`);
        }
        this.add(parsed.name, parsed);
        loadedShaders[index] = parsed;

        if (++itemsLoaded === sources.length) {
          callback(loadedShaders.length === 1 ? loadedShaders[0] : loadedShaders);
        }
      });
    });
  },
  registerCamera(camera) {
    if (!(camera instanceof THREE.Camera)) {
      throw new Error('Cannot register a non-camera as a camera!');
    }
    this.mainCamera = camera;
  },
  registerCubeCamera(name, camera) {
    if (!camera.renderTarget) {
      throw new Error('Cannot register a non-camera as a camera!');
    }
    this.cubeCameras[name] = camera;
  },
  unregisterCamera(name) {
    if (name in this.cubeCameras) {
      delete this.cubeCameras[name];
    } else if (name === this.mainCamera) {
      delete this.mainCamera;
    } else {
      throw new Error(`You never registered camera ${name}`);
    }
  },
  updateSource(identifier, config, findBy = 'name') {
    if (!this.shaderTypes[identifier]) {
      throw new Error(`Runtime Error: Cannot update shader ${identifier} because it has not been added.`);
    }

    const newShaderData = this.add(identifier, config);
    this.runningShaders.forEach((shader) => {
      if (shader[findBy] === identifier) {
        extend(shader.material, omit(newShaderData, 'id', 'url', 'user'));
        shader.material.needsUpdate = true;
      }
    });
  },
  renameShader(oldName, newName) {
    if (!(oldName in this.shaderTypes)) {
      throw new Error(`Could not rename shader ${oldName} to ${newName}. It does not exist.`);
    }

    this.shaderTypes[newName] = this.shaderTypes[oldName];
    delete this.shaderTypes[oldName];

    this.runningShaders.forEach((shader) => {
      if (shader.name === oldName) {
        shader.name = newName;
      }
    });
  },
  get(identifier) {
    const shaderType = this.shaderTypes[identifier];
    if (!shaderType.initted) {
      this.create(identifier);
    }
    return shaderType.material;
  },
  add(shaderName, config) {
    const newData = clone(config);
    newData.fragmentShader = config.fragment;
    newData.vertexShader = config.vertex;
    delete newData.fragment;
    delete newData.vertex;

    for (const uniformName in newData.uniforms) {
      const uniform = newData.uniforms[uniformName];
      if (uniform.value === null) {
        newData.uniforms[uniformName].value = this.getUmap(uniform.glslType);
      }
    }

    if (shaderName in this.shaderTypes) {
      extend(this.shaderTypes[shaderName], omit(newData, 'url', 'user'));
    } else {
      this.shaderTypes[shaderName] = omit(newData, 'url', 'user');
    }
    return newData;
  },
  create(identifier) {
    const shaderType = this.shaderTypes[identifier];
    shaderType.material = new THREE.RawShaderMaterial(shaderType);
    this.runningShaders.push(shaderType);
    if (shaderType.init) {
      shaderType.init(shaderType.material);
    }
    shaderType.material.needsUpdate = true;
    shaderType.initted = true;
    return shaderType.material;
  },
  updateRuntime(identifier, data, findBy = 'name') {
    this.runningShaders.forEach((shader) => {
      if (shader[findBy] === identifier) {
        for (const uniformName in data.uniforms) {
          if (!(uniformName in this.reserved)) {
            const uniform = data.uniforms[uniformName];
            if (uniform.type === 't' && typeof uniform.value === 'string') {
              uniform.value = this.cubeCameras[uniform.value].renderTarget;
            }
            shader.material.uniforms[uniformName].value = uniform.value;
          }
        }
      }
    });
  },
  updateShaders(time, obj = {}) {
    this.runningShaders.forEach((shader) => {
      for (const uniform in obj.uniforms) {
        if (uniform in shader.material.uniforms) {
          shader.material.uniforms[uniform].value = obj.uniforms[uniform];
        }
      }
      if ('cameraPosition' in shader.material.uniforms && this.mainCamera) {
        shader.material.uniforms.cameraPosition.value = this.mainCamera.position.clone();
      }
      if ('viewMatrix' in shader.material.uniforms && this.mainCamera) {
        shader.material.uniforms.viewMatrix.value = this.mainCamera.matrixWorldInverse;
      }
      if ('time' in shader.material.uniforms) {
        shader.material.uniforms.time.value = time;
      }
    });
  }
};

// Convenience methods
function extend(target, ...sources) {
  sources.forEach(source => {
    if (source) {
      Object.keys(source).forEach(key => {
        target[key] = source[key];
      });
    }
  });
  return target;
}

function clone(obj) {
  return extend({}, obj);
}

function omit(obj, ...keys) {
  const cloned = clone(obj);
  keys.forEach(key => {
    delete cloned[key];
  });
  return cloned;
}

