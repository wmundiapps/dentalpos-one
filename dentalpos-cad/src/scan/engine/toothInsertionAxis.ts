import * as THREE from "three";

export interface InsertionAxis {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface InsertionAxisAnalysis {
  axis: InsertionAxis;

  angleX: number;
  angleY: number;
  angleZ: number;

  undercutRisk: boolean;

  deviationFromVertical: number;
}

export function createInsertionAxis(
  origin: THREE.Vector3,
  direction: THREE.Vector3
): InsertionAxis {
  const normalized =
    direction.clone().normalize();

  return {
    origin:
      origin.clone(),

    direction:
      normalized,
  };
}

export function getDefaultInsertionAxis(
  object: THREE.Object3D
): InsertionAxis {
  object.updateMatrixWorld(
    true
  );

  const box =
    new THREE.Box3().setFromObject(
      object
    );

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  return {
    origin:
      center,

    direction:
      new THREE.Vector3(
        0,
        1,
        0
      ),
  };
}

export function analyzeInsertionAxis(
  axis: InsertionAxis
): InsertionAxisAnalysis {
  const vertical =
    new THREE.Vector3(
      0,
      1,
      0
    );

  const direction =
    axis.direction
      .clone()
      .normalize();

  const deviation =
    THREE.MathUtils.radToDeg(
      direction.angleTo(
        vertical
      )
    );

  const angleX =
    THREE.MathUtils.radToDeg(
      Math.atan2(
        direction.z,
        direction.y
      )
    );

  const angleZ =
    THREE.MathUtils.radToDeg(
      Math.atan2(
        direction.x,
        direction.y
      )
    );

  const angleY =
    THREE.MathUtils.radToDeg(
      Math.atan2(
        direction.x,
        direction.z
      )
    );

  return {
    axis: {
      origin:
        axis.origin.clone(),

      direction:
        direction.clone(),
    },

    angleX,

    angleY,

    angleZ,

    deviationFromVertical:
      deviation,

    undercutRisk:
      deviation > 15,
  };
}

export function createInsertionAxisVisualization(
  axis: InsertionAxis,
  length = 15
) {
  const group =
    new THREE.Group();

  group.name =
    "DENTALPOS_INSERTION_AXIS";

  const start =
    axis.origin.clone();

  const end =
    axis.origin
      .clone()
      .add(
        axis.direction
          .clone()
          .normalize()
          .multiplyScalar(
            length
          )
      );

  const lineGeometry =
    new THREE.BufferGeometry()
      .setFromPoints([
        start,
        end,
      ]);

  const lineMaterial =
    new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      depthTest: false,
    });

  const line =
    new THREE.Line(
      lineGeometry,
      lineMaterial
    );

  line.renderOrder =
    1500;

  group.add(
    line
  );

  const arrow =
    new THREE.ArrowHelper(
      axis.direction
        .clone()
        .normalize(),

      axis.origin,

      length,

      0x22d3ee,

      2,

      1
    );

  arrow.renderOrder =
    1501;

  group.add(
    arrow
  );

  return group;
}

export function updateInsertionAxisVisualization(
  scene: THREE.Scene,
  axis: InsertionAxis,
  length = 15
) {
  clearInsertionAxisVisualization(
    scene
  );

  const visualization =
    createInsertionAxisVisualization(
      axis,
      length
    );

  scene.add(
    visualization
  );

  return visualization;
}

export function clearInsertionAxisVisualization(
  scene: THREE.Scene
) {
  const object =
    scene.getObjectByName(
      "DENTALPOS_INSERTION_AXIS"
    );

  if (!object) {
    return;
  }

  scene.remove(
    object
  );

  object.traverse(
    (child) => {
      if (
        child instanceof
          THREE.Mesh ||
        child instanceof
          THREE.Line
      ) {
        child.geometry.dispose();

        const materials =
          Array.isArray(
            child.material
          )
            ? child.material
            : [child.material];

        materials.forEach(
          (material) =>
            material.dispose()
        );
      }
    }
  );
}

export function rotateInsertionAxis(
  axis: InsertionAxis,
  xDegrees: number,
  zDegrees: number
): InsertionAxis {
  const direction =
    axis.direction.clone();

  const quaternionX =
    new THREE.Quaternion()
      .setFromAxisAngle(
        new THREE.Vector3(
          1,
          0,
          0
        ),

        THREE.MathUtils.degToRad(
          xDegrees
        )
      );

  const quaternionZ =
    new THREE.Quaternion()
      .setFromAxisAngle(
        new THREE.Vector3(
          0,
          0,
          1
        ),

        THREE.MathUtils.degToRad(
          zDegrees
        )
      );

  direction.applyQuaternion(
    quaternionX
  );

  direction.applyQuaternion(
    quaternionZ
  );

  direction.normalize();

  return {
    origin:
      axis.origin.clone(),

    direction,
  };
}

export function alignObjectToInsertionAxis(
  object: THREE.Object3D,
  axis: InsertionAxis
) {
  const vertical =
    new THREE.Vector3(
      0,
      1,
      0
    );

  const quaternion =
    new THREE.Quaternion()
      .setFromUnitVectors(
        vertical,
        axis.direction
          .clone()
          .normalize()
      );

  object.quaternion.copy(
    quaternion
  );

  object.updateMatrixWorld(
    true
  );

  return quaternion;
}