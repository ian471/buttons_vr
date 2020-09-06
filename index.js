/* global BABYLON */
/* eslint no-unused-vars: 0 */

const canvas = document.getElementById('renderCanvas')

let engine = null
let scene = null
function createDefaultEngine () {
  return new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  })
}

const collisionMeshes = {}
const SCALE = 0.125

const onSqueezeStateChangedObservable = new BABYLON.Observable()

function getGameObjectFromMesh (mesh) {
  return collisionMeshes[mesh.uniqueId]
}

async function createScene () {
  // Create the scene space
  var scene = new BABYLON.Scene(engine)

  const light = scene.createDefaultLight()
  const env = scene.createDefaultEnvironment()
  const defaultXr = await scene.createDefaultXRExperienceAsync({
    floorMeshes: [env.ground]
  })
  const xr = defaultXr.baseExperience
  // console.log('Available features:', BABYLON.WebXRFeaturesManager.GetAvailableFeatures())
  // console.log('Enabled features:', xr.featuresManager.getEnabledFeatures())

  // Set up controller bindings
  defaultXr.input.onControllerAddedObservable.add(inputSource => {
    inputSource.onMotionControllerInitObservable.add(motionController => {
      // Handle squeeze action
      const squeeze = motionController.getComponentOfType('squeeze')
      if (squeeze) {
        squeeze.onButtonStateChangedObservable.add(() => {
          if (squeeze.changes.pressed) {
            onSqueezeStateChangedObservable.notifyObservers({
              input: inputSource,
              pressed: squeeze.pressed
            })
          }
        })
      }

      // Handle B/Y button
      for (const id of ['b-button', 'y-button']) {
        const component = motionController.components[id]
        if (!component) continue
        component.onButtonStateChangedObservable.add(() => {
          if (component.pressed) {
            xr.exitXRAsync()
          }
        })
      }
    })
  })
  onSqueezeStateChangedObservable.add(({ input, pressed }) => {
    if (pressed) {
      const mesh = defaultXr.pointerSelection.getMeshUnderPointer(input.uniqueId)
      if (mesh) {
        const obj = getGameObjectFromMesh(mesh)
        if (obj) {
          obj._onGrab(input)
        }
      }
    }
  })

  const metal = new BABYLON.StandardMaterial('metal', scene)
  metal.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5)

  const blackPlastic = new BABYLON.StandardMaterial('blackPlastic', scene)
  blackPlastic.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1)

  const redPlastic = new BABYLON.StandardMaterial('redPlastic', scene)
  redPlastic.diffuseColor = new BABYLON.Color3(0.5, 0.0, 0.0)

  const redPlasticLit = new BABYLON.StandardMaterial('redPlasticLit', scene)
  redPlasticLit.diffuseColor = redPlastic.diffuseColor
  redPlasticLit.emissiveColor = new BABYLON.Color3(0.5, 0.0, 0.0)

  const panel = new Panel(scene)
  panel.xformNode.position = new BABYLON.Vector3(0, 1.25, 1)
  panel.xformNode.scaling = new BABYLON.Vector3(SCALE, SCALE, SCALE)
  panel.update()

  const button = new Button(scene)
  button.attachToPanel(panel, 2, 2)
  button.update()

  const sw = new Switch(scene)
  sw.attachToPanel(panel, 2, 3)
  sw.update()

  const switchSound = new BABYLON.Sound('switch', 'audio/switch.mp3', scene, null, {
    spatialSound: true
  })
  const buttonDownSound = new BABYLON.Sound('buttonDown', 'audio/button_down.mp3', scene, null, {
    spatialSound: true
  })
  const buttonUpSound = new BABYLON.Sound('buttonUp', 'audio/button_up.mp3', scene, null, {
    spatialSound: true
  })

  scene.onPointerDown = (event, { hit, pickedMesh }) => {
    if (hit) {
      const obj = getGameObjectFromMesh(pickedMesh)
      if (obj && obj.onActivate) {
        obj.onActivate(pickedMesh)
      }
    }
  }

  return scene
}

function playSound (name, position, scene) {
  const sound = scene.getSoundByName(name)
  if (!sound) {
    console.error('Unable to play sound', name)
  }
  if (position) {
    sound.setPosition(position)
  }
  sound.play()
}

class GameObject {
  constructor (scene) {
    this.scene = scene
    this.xformNode = new BABYLON.TransformNode()
    this.labelTexture = null
    this.grabbed = false
    this.grabbingInput = null
  }

  attachToPanel (panel, row, col) {
    this.xformNode.parent = panel.xformNode
    this.xformNode.position = panel.positionFromIndex(row, col)
  }

  registerCollisionMesh (mesh) {
    collisionMeshes[mesh.uniqueId] = this
  }

  setLabel (text) {
    this.labelTexture = new BABYLON.DynamicTexture('label', {
      width: 128,
      height: 64
    }, this.scene)
    this.labelTexture.drawText(text)
  }

  update () {
    // Implement me
  }

  onActivate () {
    // Implement me
  }

  _onGrab (input) {
    this.grabbed = true
    this.grabbingInput = input
    onSqueezeStateChangedObservable.add(({ input, pressed }) => {
      if (input === this.grabbingInput && !pressed) {
        this.onRelease(input)
      }
    })
    this.onGrab(input)
  }

  onGrab (input) {
    // Implement me
    this.xformNode.setParent(input.grip)
  }

  _onRelease (input) {
    this.grabbed = false
    this.onRelease(input)
  }

  onRelease (input) {
    // Implement me
    this.xformNode.setParent(null)
  }
}

class Switch extends GameObject {
  constructor (scene) {
    super(scene)

    this.value = 0

    this.plate = BABYLON.MeshBuilder.CreateBox('plate', {
      width: 0.5,
      height: 0.8,
      depth: 0.2
    }, scene)
    this.toggle = BABYLON.MeshBuilder.CreateBox('toggle', {
      width: 0.2,
      height: 0.2,
      depth: 0.5
    }, scene)

    this.plate.parent = this.xformNode
    this.toggle.parent = this.xformNode
    this.toggle.position.z = 0.2
    this.toggle.setPivotPoint(new BABYLON.Vector3(0, 0, -0.2))

    this.plate.material = scene.getMaterialByName('metal')
    this.toggle.material = scene.getMaterialByName('blackPlastic')

    this.registerCollisionMesh(this.plate)
    this.registerCollisionMesh(this.toggle)
  }

  update () {
    this.toggle.rotation.x = Math.PI / 4 * (this.value * -2 + 1)
  }

  onActivate (mesh) {
    this.value = 1 - this.value
    this.update()
    playSound('switch', mesh.position, this.scene)
  }
}

class Button extends GameObject {
  constructor (scene) {
    super(scene)
    this.value = 0
    this.plate = BABYLON.MeshBuilder.CreateBox('plate', {
      width: 0.8,
      height: 0.8,
      depth: 0.2
    }, scene)
    this.toggle = BABYLON.MeshBuilder.CreateBox('toggle', {
      width: 0.6,
      height: 0.6,
      depth: 0.3
    }, scene)
    this.plate.parent = this.xformNode
    this.toggle.parent = this.xformNode
    this.plate.material = scene.getMaterialByName('metal')
    this.registerCollisionMesh(this.plate)
    this.registerCollisionMesh(this.toggle)
    this.activationTimeout = null
  }

  update () {
    if (this.value > 0) {
      this.toggle.material = this.scene.getMaterialByName('redPlasticLit')
      this.toggle.position.z = 0.1
    } else {
      this.toggle.material = this.scene.getMaterialByName('redPlastic')
      this.toggle.position.z = 0.2
    }
  }

  onActivate (mesh) {
    this.value = 1
    if (this.activationTimeout) {
      clearTimeout(this.activationTimeout)
    }
    this.activationTimeout = setTimeout(() => {
      this.value = 0
      this.update()
      playSound('buttonUp', mesh.position, this.scene)
    }, 500)
    this.update()
    playSound('buttonDown', mesh.position, this.scene)
  }
}

class Panel extends GameObject {
  constructor (scene, width = 6, height = 4) {
    super(scene)
    this.width = width
    this.height = height
    this.panel = BABYLON.MeshBuilder.CreateBox('panel', {
      width,
      height,
      depth: 0.4
    }, scene)
    this.xformNode.rotation.x = Math.PI * -1 / 6
    this.xformNode.rotation.y = Math.PI
    this.panel.material = this.scene.getMaterialByName('metal')
    this.panel.parent = this.xformNode
    this.panel.position.z = -0.2
    this.registerCollisionMesh(this.panel)
  }

  positionFromIndex (row, column) {
    return new BABYLON.Vector3(
      this.width * 0.5 - column - 0.5,
      this.height * 0.5 - row - 0.5,
      0
    )
  }
}

engine = createDefaultEngine()
if (!engine) throw new Error('engine should not be null.')
createScene().then(s => { scene = s })

engine.runRenderLoop(function () {
  if (scene) {
    scene.render()
  }
})

// Resize
window.addEventListener('resize', function () {
  engine.resize()
})
