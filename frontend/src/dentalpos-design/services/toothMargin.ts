import * as THREE from "three";

export interface MarginPoint {
  id: string;
  position: THREE.Vector3;
}

export interface MarginLine {
  points: MarginPoint[];
  closed: boolean;
}

export function createMarginPoint(
  position: THREE.Vector3
): MarginPoint {
  return {
    id: crypto.randomUUID(),
    position: position.clone(),
  };
}

export function addMarginPoint(
  margin: MarginLine,
  position: THREE.Vector3
): MarginLine {
  return {
    ...margin,

    points: [
      ...margin.points,
      createMarginPoint(
        position
      ),
    ],
  };
}

export function createEmptyMargin(): MarginLine {
  return {
    points: [],
    closed: false,
  };
}

export function closeMargin(
  margin: MarginLine
): MarginLine {
  if (
    margin.points.length < 3
  ) {
    return margin;
  }

  return {
    ...margin,
    closed: true,
  };
}

export function createMarginVisualization(
  margin: MarginLine
) {
  const group =
    new THREE.Group();

  group.name =
    "DENTALPOS_MARGIN";

  if (
    margin.points.length === 0
  ) {
    return group;
  }

  margin.points.forEach(
    (marginPoint) => {
      const geometry =
        new THREE.SphereGeometry(
          0.22,
          12,
          12
        );

      const material =
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          depthTest: false,
        });

      const marker =
        new THREE.Mesh(
          geometry,
          material
        );

      marker.position.copy(
        marginPoint.position
      );

      marker.renderOrder =
        1400;

      group.add(
        marker
      );
    }
  );

  if (
    margin.points.length >= 2
  ) {
    const points =
      margin.points.map(
        (point) =>
          point.position.clone()
      );

    if (
      margin.closed &&
      points.length >= 3
    ) {
      points.push(
        points[0].clone()
      );
    }

    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints(
          points
        );

    const material =
      new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        depthTest: false,
      });

    const line =
      new THREE.Line(
        geometry,
        material
      );

    line.renderOrder =
      1399;

    group.add(
      line
    );
  }

  return group;
}

export function updateMarginVisualization(
  scene: THREE.Scene,
  margin: MarginLine
) {
  clearMarginVisualization(
    scene
  );

  const visualization =
    createMarginVisualization(
      margin
    );

  scene.add(
    visualization
  );

  return visualization;
}

export function clearMarginVisualization(
  scene: THREE.Scene
) {
  const object =
    scene.getObjectByName(
      "DENTALPOS_MARGIN"
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
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line
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

export function calculateMarginLength(
  margin: MarginLine
) {
  if (
    margin.points.length < 2
  ) {
    return 0;
  }

  let length = 0;

  for (
    let index = 1;
    index < margin.points.length;
    index += 1
  ) {
    length +=
      margin.points[
        index - 1
      ].position.distanceTo(
        margin.points[
          index
        ].position
      );
  }

  if (
    margin.closed &&
    margin.points.length >= 3
  ) {
    length +=
      margin.points[
        margin.points.length - 1
      ].position.distanceTo(
        margin.points[0]
          .position
      );
  }

  return length;
}

export function removeLastMarginPoint(
  margin: MarginLine
): MarginLine {
  if (
    margin.points.length === 0
  ) {
    return margin;
  }

  return {
    points:
      margin.points.slice(
        0,
        -1
      ),

    closed: false,
  };
}

export function clearMargin(): MarginLine {
  return createEmptyMargin();
}