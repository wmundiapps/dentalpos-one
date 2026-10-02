import * as THREE from "three";

export interface MeasurementPoint {
  id: string;
  position: THREE.Vector3;
}

export interface DistanceMeasurement {
  start: MeasurementPoint;
  end: MeasurementPoint;
  distance: number;
  midpoint: THREE.Vector3;
}

export function calculateDistance(
  start: THREE.Vector3,
  end: THREE.Vector3
): number {
  return start.distanceTo(end);
}

export function createDistanceMeasurement(
  start: THREE.Vector3,
  end: THREE.Vector3
): DistanceMeasurement {
  const startPoint: MeasurementPoint = {
    id: crypto.randomUUID(),
    position: start.clone(),
  };

  const endPoint: MeasurementPoint = {
    id: crypto.randomUUID(),
    position: end.clone(),
  };

  const midpoint = new THREE.Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5);

  return {
    start: startPoint,
    end: endPoint,
    distance: calculateDistance(start, end),
    midpoint,
  };
}

export function createMeasurementMarker(
  position: THREE.Vector3,
  color = 0xf59e0b
) {
  const geometry =
    new THREE.SphereGeometry(
      0.45,
      18,
      18
    );

  const material =
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
    });

  const marker =
    new THREE.Mesh(
      geometry,
      material
    );

  marker.position.copy(
    position
  );

  marker.renderOrder = 1000;

  marker.name =
    "DENTALPOS_MEASUREMENT_POINT";

  return marker;
}

export function createMeasurementLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color = 0xf59e0b
) {
  const geometry =
    new THREE.BufferGeometry().setFromPoints([
      start,
      end,
    ]);

  const material =
    new THREE.LineBasicMaterial({
      color,
      depthTest: false,
    });

  const line =
    new THREE.Line(
      geometry,
      material
    );

  line.name =
    "DENTALPOS_MEASUREMENT_LINE";

  line.renderOrder = 999;

  return line;
}

export function clearMeasurements(
  scene: THREE.Scene
) {
  const objectsToRemove:
    THREE.Object3D[] = [];

  scene.traverse(
    (object) => {
      if (
        object.name ===
          "DENTALPOS_MEASUREMENT_POINT" ||
        object.name ===
          "DENTALPOS_MEASUREMENT_LINE"
      ) {
        objectsToRemove.push(
          object
        );
      }
    }
  );

  objectsToRemove.forEach(
    (object) => {
      scene.remove(object);

      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line
      ) {
        object.geometry.dispose();

        const materials =
          Array.isArray(
            object.material
          )
            ? object.material
            : [object.material];

        materials.forEach(
          (material) =>
            material.dispose()
        );
      }
    }
  );
}

export function formatMeasurement(
  distance: number
) {
  return `${distance.toFixed(
    2
  )} mm`;
}