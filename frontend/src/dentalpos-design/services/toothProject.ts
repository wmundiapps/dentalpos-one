import * as THREE from "three";

export interface ToothProjectItem {
  toothNumber: number;

  name: string;

  position: [
    number,
    number,
    number
  ];

  rotation: [
    number,
    number,
    number
  ];

  scale: [
    number,
    number,
    number
  ];

  visible: boolean;
}

export interface DentalPosDesignProject {
  version: string;

  name: string;

  createdAt: string;

  updatedAt: string;

  teeth: ToothProjectItem[];
}

export function createDentalPosProject(
  name = "Novo Projeto"
): DentalPosDesignProject {
  const now =
    new Date().toISOString();

  return {
    version: "ALPHA",

    name,

    createdAt: now,

    updatedAt: now,

    teeth: [],
  };
}

export function createProjectToothItem(
  toothNumber: number,
  mesh: THREE.Mesh
): ToothProjectItem {
  return {
    toothNumber,

    name:
      mesh.name ||
      `Dente ${toothNumber}`,

    position: [
      mesh.position.x,
      mesh.position.y,
      mesh.position.z,
    ],

    rotation: [
      mesh.rotation.x,
      mesh.rotation.y,
      mesh.rotation.z,
    ],

    scale: [
      mesh.scale.x,
      mesh.scale.y,
      mesh.scale.z,
    ],

    visible:
      mesh.visible,
  };
}

export function updateProjectFromScene(
  project: DentalPosDesignProject,

  teeth: Array<{
    toothNumber: number;
    mesh: THREE.Mesh;
  }>
): DentalPosDesignProject {
  return {
    ...project,

    updatedAt:
      new Date().toISOString(),

    teeth:
      teeth.map(
        ({
          toothNumber,
          mesh,
        }) =>
          createProjectToothItem(
            toothNumber,
            mesh
          )
      ),
  };
}

export function serializeDentalPosProject(
  project: DentalPosDesignProject
) {
  return JSON.stringify(
    project,
    null,
    2
  );
}

export function downloadDentalPosProject(
  project: DentalPosDesignProject
) {
  const content =
    serializeDentalPosProject(
      project
    );

  const blob =
    new Blob(
      [content],
      {
        type:
          "application/json",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  const safeName =
    project.name
      .trim()
      .replace(
        /[^a-zA-Z0-9-_]/g,
        "_"
      );

  anchor.href =
    url;

  anchor.download =
    `${safeName || "DentalPos_Design"}.dentalpos.json`;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  document.body.removeChild(
    anchor
  );

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    100
  );
}

export function parseDentalPosProject(
  content: string
): DentalPosDesignProject {
  const parsed =
    JSON.parse(
      content
    );

  if (
    !parsed ||
    typeof parsed !==
      "object"
  ) {
    throw new Error(
      "Projeto DentalPos inválido."
    );
  }

  if (
    !Array.isArray(
      parsed.teeth
    )
  ) {
    throw new Error(
      "Projeto sem estrutura dental válida."
    );
  }

  return parsed as DentalPosDesignProject;
}

export function readDentalPosProjectFile(
  file: File
): Promise<DentalPosDesignProject> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader();

      reader.onload =
        () => {
          try {
            const content =
              String(
                reader.result ??
                  ""
              );

            const project =
              parseDentalPosProject(
                content
              );

            resolve(
              project
            );
          } catch (
            error
          ) {
            reject(
              error
            );
          }
        };

      reader.onerror =
        () => {
          reject(
            new Error(
              "Não foi possível abrir o projeto."
            )
          );
        };

      reader.readAsText(
        file
      );
    }
  );
}

export function applyProjectItemTransform(
  mesh: THREE.Mesh,
  item: ToothProjectItem
) {
  mesh.position.set(
    item.position[0],
    item.position[1],
    item.position[2]
  );

  mesh.rotation.set(
    item.rotation[0],
    item.rotation[1],
    item.rotation[2]
  );

  mesh.scale.set(
    item.scale[0],
    item.scale[1],
    item.scale[2]
  );

  mesh.visible =
    item.visible;

  mesh.updateMatrixWorld(
    true
  );
}