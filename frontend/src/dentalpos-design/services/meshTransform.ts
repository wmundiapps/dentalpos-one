import * as THREE from "three";

export interface MeshTransformState {
  position: {
    x: number;
    y: number;
    z: number;
  };

  rotation: {
    x: number;
    y: number;
    z: number;
  };

  scale: {
    x: number;
    y: number;
    z: number;
  };
}

export function getMeshTransform(
  mesh: THREE.Object3D
): MeshTransformState {
  return {
    position: {
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
    },

    rotation: {
      x: THREE.MathUtils.radToDeg(
        mesh.rotation.x
      ),

      y: THREE.MathUtils.radToDeg(
        mesh.rotation.y
      ),

      z: THREE.MathUtils.radToDeg(
        mesh.rotation.z
      ),
    },

    scale: {
      x: mesh.scale.x,
      y: mesh.scale.y,
      z: mesh.scale.z,
    },
  };
}

export function setMeshPosition(
  mesh: THREE.Object3D,
  x: number,
  y: number,
  z: number
) {
  mesh.position.set(
    x,
    y,
    z
  );

  mesh.updateMatrixWorld(
    true
  );
}

export function moveMesh(
  mesh: THREE.Object3D,
  x: number,
  y: number,
  z: number
) {
  mesh.position.x += x;
  mesh.position.y += y;
  mesh.position.z += z;

  mesh.updateMatrixWorld(
    true
  );
}

export function setMeshRotation(
  mesh: THREE.Object3D,
  xDegrees: number,
  yDegrees: number,
  zDegrees: number
) {
  mesh.rotation.set(
    THREE.MathUtils.degToRad(
      xDegrees
    ),

    THREE.MathUtils.degToRad(
      yDegrees
    ),

    THREE.MathUtils.degToRad(
      zDegrees
    )
  );

  mesh.updateMatrixWorld(
    true
  );
}

export function rotateMesh(
  mesh: THREE.Object3D,
  xDegrees: number,
  yDegrees: number,
  zDegrees: number
) {
  mesh.rotateX(
    THREE.MathUtils.degToRad(
      xDegrees
    )
  );

  mesh.rotateY(
    THREE.MathUtils.degToRad(
      yDegrees
    )
  );

  mesh.rotateZ(
    THREE.MathUtils.degToRad(
      zDegrees
    )
  );

  mesh.updateMatrixWorld(
    true
  );
}

export function setMeshScale(
  mesh: THREE.Object3D,
  x: number,
  y: number,
  z: number
) {
  mesh.scale.set(
    x,
    y,
    z
  );

  mesh.updateMatrixWorld(
    true
  );
}

export function scaleMeshUniformly(
  mesh: THREE.Object3D,
  scale: number
) {
  mesh.scale.setScalar(
    scale
  );

  mesh.updateMatrixWorld(
    true
  );
}

export function resetMeshTransform(
  mesh: THREE.Object3D
) {
  mesh.position.set(
    0,
    0,
    0
  );

  mesh.rotation.set(
    0,
    0,
    0
  );

  mesh.scale.set(
    1,
    1,
    1
  );

  mesh.updateMatrixWorld(
    true
  );
}

export function cloneMeshTransform(
  source: THREE.Object3D,
  target: THREE.Object3D
) {
  target.position.copy(
    source.position
  );

  target.rotation.copy(
    source.rotation
  );

  target.scale.copy(
    source.scale
  );

  target.updateMatrixWorld(
    true
  );
}