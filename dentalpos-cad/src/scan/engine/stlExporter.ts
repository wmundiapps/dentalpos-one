import * as THREE from "three";

export function exportGeometryToSTL(
  geometry: THREE.BufferGeometry,
  fileName = "DentalPos-reparado.stl"
) {
  const source =
    geometry.index
      ? geometry.toNonIndexed()
      : geometry.clone();

  const position =
    source.getAttribute("position");

  if (!position) {
    source.dispose();

    throw new Error(
      "Geometria sem posições para exportação."
    );
  }

  const triangleCount =
    Math.floor(position.count / 3);

  const bufferLength =
    84 + triangleCount * 50;

  const buffer =
    new ArrayBuffer(bufferLength);

  const view =
    new DataView(buffer);

  /*
   * Cabeçalho STL binário
   */

  const header =
    "DentalPos 3D Core - STL";

  for (
    let index = 0;
    index < 80;
    index += 1
  ) {
    view.setUint8(
      index,
      index < header.length
        ? header.charCodeAt(index)
        : 0
    );
  }

  view.setUint32(
    80,
    triangleCount,
    true
  );

  let offset = 84;

  const a =
    new THREE.Vector3();

  const b =
    new THREE.Vector3();

  const c =
    new THREE.Vector3();

  const ab =
    new THREE.Vector3();

  const ac =
    new THREE.Vector3();

  const normal =
    new THREE.Vector3();

  for (
    let triangleIndex = 0;
    triangleIndex < triangleCount;
    triangleIndex += 1
  ) {
    const base =
      triangleIndex * 3;

    a.set(
      position.getX(base),
      position.getY(base),
      position.getZ(base)
    );

    b.set(
      position.getX(base + 1),
      position.getY(base + 1),
      position.getZ(base + 1)
    );

    c.set(
      position.getX(base + 2),
      position.getY(base + 2),
      position.getZ(base + 2)
    );

    ab.subVectors(b, a);
    ac.subVectors(c, a);

    normal
      .crossVectors(ab, ac)
      .normalize();

    /*
     * Normal
     */

    view.setFloat32(
      offset,
      normal.x,
      true
    );

    view.setFloat32(
      offset + 4,
      normal.y,
      true
    );

    view.setFloat32(
      offset + 8,
      normal.z,
      true
    );

    offset += 12;

    /*
     * Vértice A
     */

    view.setFloat32(
      offset,
      a.x,
      true
    );

    view.setFloat32(
      offset + 4,
      a.y,
      true
    );

    view.setFloat32(
      offset + 8,
      a.z,
      true
    );

    offset += 12;

    /*
     * Vértice B
     */

    view.setFloat32(
      offset,
      b.x,
      true
    );

    view.setFloat32(
      offset + 4,
      b.y,
      true
    );

    view.setFloat32(
      offset + 8,
      b.z,
      true
    );

    offset += 12;

    /*
     * Vértice C
     */

    view.setFloat32(
      offset,
      c.x,
      true
    );

    view.setFloat32(
      offset + 4,
      c.y,
      true
    );

    view.setFloat32(
      offset + 8,
      c.z,
      true
    );

    offset += 12;

    /*
     * Attribute byte count
     */

    view.setUint16(
      offset,
      0,
      true
    );

    offset += 2;
  }

  source.dispose();

  const blob =
    new Blob(
      [buffer],
      {
        type: "application/octet-stream",
      }
    );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;

  document.body.appendChild(anchor);

  anchor.click();

  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}