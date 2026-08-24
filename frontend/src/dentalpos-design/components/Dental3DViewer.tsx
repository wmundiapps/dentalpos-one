import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface Dental3DViewerProps {
  stlFile: File | null;
  toothFile?: File | null;
  antagonistFile?: File | null;
  biteFile?: File | null;
  generatedToothNumber?: number | null;
  toothCharacter?: string;
  occlusionNonce?: number;
  activeTool?: string;
  brushStrength?: number;
  onGeometryLoaded?: (
    geometry: THREE.BufferGeometry | null
  ) => void;
}

interface MeshInfo {
  triangles: number;
  width: number;
  height: number;
  depth: number;
}

type ViewName =
  | "perspective"
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom";

export default function Dental3DViewer({
  stlFile,
  antagonistFile = null,
  biteFile = null,
  generatedToothNumber = null,
  toothCharacter = "Adulto",
  occlusionNonce = 0,
  activeTool = "Navegação",
  brushStrength = 35,
  onGeometryLoaded,
}: Dental3DViewerProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const sceneRef =
    useRef<THREE.Scene | null>(null);

  const cameraRef =
    useRef<THREE.PerspectiveCamera | null>(
      null
    );

  const rendererRef =
    useRef<THREE.WebGLRenderer | null>(
      null
    );

  const controlsRef =
    useRef<OrbitControls | null>(null);

  const modelRef =
    useRef<THREE.Mesh | null>(null);

  const antagonistRef = useRef<THREE.Mesh | null>(null);
  const biteRef = useRef<THREE.Mesh | null>(null);
  const generatedToothRef = useRef<THREE.Mesh | null>(null);
  const marginGroupRef = useRef<THREE.Group | null>(null);

  const gridRef =
    useRef<THREE.GridHelper | null>(null);

  const axesRef =
    useRef<THREE.AxesHelper | null>(null);

  const renderRef =
    useRef<(() => void) | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [meshInfo, setMeshInfo] =
    useState<MeshInfo | null>(null);

  const [showGrid, setShowGrid] =
    useState(false);

  const [showAxes, setShowAxes] =
    useState(false);

  const [wireframe, setWireframe] =
    useState(false);

  const [showInfo, setShowInfo] =
    useState(true);

  const createMaterial = (
    isWireframe = false
  ) => {
    return new THREE.MeshStandardMaterial({
      color: isWireframe
        ? 0x38bdf8
        : 0xe5e7eb,
      roughness: 0.72,
      metalness: 0,
      wireframe: isWireframe,
      side: THREE.DoubleSide,
    });
  };

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    while (container.firstChild) {
      container.removeChild(
        container.firstChild
      );
    }

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(0x111722);

    sceneRef.current = scene;

    const width =
      Math.max(
        container.clientWidth,
        1
      );

    const height =
      Math.max(
        container.clientHeight,
        1
      );

    const camera =
      new THREE.PerspectiveCamera(
        32,
        width / height,
        0.01,
        10000
      );

    camera.position.set(
      0,
      70,
      180
    );

    cameraRef.current =
      camera;

    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference:
          "high-performance",
      });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2
      )
    );

    renderer.setSize(
      width,
      height,
      false
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      0.9;

    renderer.domElement.style.display =
      "block";

    renderer.domElement.style.width =
      "100%";

    renderer.domElement.style.height =
      "100%";

    container.appendChild(
      renderer.domElement
    );

    rendererRef.current =
      renderer;

    const controls =
      new OrbitControls(
        camera,
        renderer.domElement
      );

    controls.enableDamping =
      false;

    controls.enableRotate =
      true;

    controls.enableZoom =
      true;

    controls.enablePan =
      true;

    controls.rotateSpeed =
      0.75;

    controls.zoomSpeed =
      0.9;

    controls.panSpeed =
      0.7;

    controlsRef.current =
      controls;

    const hemisphereLight =
      new THREE.HemisphereLight(
        0xffffff,
        0x263241,
        1.35
      );

    scene.add(
      hemisphereLight
    );

    const frontLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.6
      );

    frontLight.position.set(
      70,
      100,
      140
    );

    scene.add(
      frontLight
    );

    const leftLight =
      new THREE.DirectionalLight(
        0xdbeafe,
        1.1
      );

    leftLight.position.set(
      -120,
      40,
      60
    );

    scene.add(
      leftLight
    );

    const rightLight =
      new THREE.DirectionalLight(
        0xffffff,
        0.9
      );

    rightLight.position.set(
      120,
      20,
      30
    );

    scene.add(
      rightLight
    );

    const backLight =
      new THREE.DirectionalLight(
        0xbcd7ff,
        0.7
      );

    backLight.position.set(
      0,
      70,
      -120
    );

    scene.add(
      backLight
    );

    const grid =
      new THREE.GridHelper(
        200,
        20,
        0x334155,
        0x263241
      );

    grid.visible =
      false;

    scene.add(
      grid
    );

    gridRef.current =
      grid;

    const axes =
      new THREE.AxesHelper(
        35
      );

    axes.visible =
      false;

    scene.add(
      axes
    );

    axesRef.current =
      axes;

    const render = () => {
      renderer.render(
        scene,
        camera
      );
    };

    renderRef.current =
      render;

    controls.addEventListener(
      "change",
      render
    );

    const resizeObserver =
      new ResizeObserver(
        () => {
          const newWidth =
            Math.max(
              container.clientWidth,
              1
            );

          const newHeight =
            Math.max(
              container.clientHeight,
              1
            );

          camera.aspect =
            newWidth /
            newHeight;

          camera.updateProjectionMatrix();

          renderer.setSize(
            newWidth,
            newHeight,
            false
          );

          render();
        }
      );

    resizeObserver.observe(
      container
    );

    render();

    return () => {
      resizeObserver.disconnect();

      controls.removeEventListener(
        "change",
        render
      );

      controls.dispose();

      if (modelRef.current) {
        scene.remove(
          modelRef.current
        );

        modelRef.current.geometry.dispose();

        const material =
          modelRef.current.material;

        if (
          Array.isArray(
            material
          )
        ) {
          material.forEach(
            (item) =>
              item.dispose()
          );
        } else {
          material.dispose();
        }

        modelRef.current =
          null;
      }

      renderer.dispose();

      if (
        renderer.domElement
          .parentElement ===
        container
      ) {
        container.removeChild(
          renderer.domElement
        );
      }

      scene.clear();

      sceneRef.current =
        null;

      cameraRef.current =
        null;

      rendererRef.current =
        null;

      controlsRef.current =
        null;

      renderRef.current =
        null;
    };
  }, []);

  const fitModel = () => {
    const model =
      modelRef.current;

    const camera =
      cameraRef.current;

    const controls =
      controlsRef.current;

    if (
      !model ||
      !camera ||
      !controls
    ) {
      return;
    }

    const box =
      new THREE.Box3()
        .setFromObject(
          model
        );

    const size =
      new THREE.Vector3();

    const center =
      new THREE.Vector3();

    box.getSize(
      size
    );

    box.getCenter(
      center
    );

    const maxDimension =
      Math.max(
        size.x,
        size.y,
        size.z,
        1
      );

    const fov =
      THREE.MathUtils.degToRad(
        camera.fov
      );

    let distance =
      maxDimension /
      (
        2 *
        Math.tan(
          fov / 2
        )
      );

    distance *=
      1.15;

    camera.up.set(
      0,
      1,
      0
    );

    camera.position.set(
      center.x,
      center.y +
        maxDimension * 0.1,
      center.z +
        distance
    );

    camera.near =
      Math.max(
        distance / 5000,
        0.001
      );

    camera.far =
      Math.max(
        distance * 100,
        1000
      );

    camera.updateProjectionMatrix();

    controls.target.copy(
      center
    );

    camera.lookAt(
      center
    );

    controls.update();

    renderRef.current?.();
  };

  useEffect(() => {
    const scene =
      sceneRef.current;

    if (!scene) {
      return;
    }

    if (
      modelRef.current
    ) {
      scene.remove(
        modelRef.current
      );

      modelRef.current.geometry.dispose();

      const oldMaterial =
        modelRef.current.material;

      if (
        Array.isArray(
          oldMaterial
        )
      ) {
        oldMaterial.forEach(
          (item) =>
            item.dispose()
        );
      } else {
        oldMaterial.dispose();
      }

      modelRef.current =
        null;
    }

    setMeshInfo(
      null
    );

    onGeometryLoaded?.(
      null
    );

    renderRef.current?.();

    if (!stlFile) {
      return;
    }

    setLoading(
      true
    );

    let cancelled =
      false;

    const reader =
      new FileReader();

    reader.onload = (
      event
    ) => {
      if (cancelled) {
        return;
      }

      try {
        const result =
          event.target
            ?.result;

        if (
          !(
            result instanceof
            ArrayBuffer
          )
        ) {
          setLoading(
            false
          );

          return;
        }

        const loader =
          new STLLoader();

        const geometry =
          loader.parse(
            result
          );

        geometry.computeVertexNormals();

        geometry.computeBoundingBox();

        const originalBox =
          geometry.boundingBox;

        if (!originalBox) {
          geometry.dispose();

          setLoading(
            false
          );

          return;
        }

        const center =
          new THREE.Vector3();

        originalBox.getCenter(
          center
        );

        geometry.translate(
          -center.x,
          -center.y,
          -center.z
        );

        geometry.computeBoundingBox();

        geometry.computeBoundingSphere();

        if (
          modelRef.current
        ) {
          scene.remove(
            modelRef.current
          );

          modelRef.current.geometry.dispose();

          const previousMaterial =
            modelRef.current.material;

          if (
            Array.isArray(
              previousMaterial
            )
          ) {
            previousMaterial.forEach(
              (item) =>
                item.dispose()
            );
          } else {
            previousMaterial.dispose();
          }

          modelRef.current =
            null;
        }

        const material =
          createMaterial(
            false
          );

        const mesh =
          new THREE.Mesh(
            geometry,
            material
          );

        mesh.name =
          "DENTALPOS_SINGLE_ARCH";

        scene.add(
          mesh
        );

        modelRef.current =
          mesh;

        const finalBox =
          new THREE.Box3()
            .setFromObject(
              mesh
            );

        const dimensions =
          new THREE.Vector3();

        finalBox.getSize(
          dimensions
        );

        const positionAttribute =
          geometry.getAttribute(
            "position"
          );

        setMeshInfo({
          triangles:
            Math.floor(
              positionAttribute.count /
                3
            ),

          width:
            dimensions.x,

          height:
            dimensions.y,

          depth:
            dimensions.z,
        });

        /*
         * Entregamos uma cópia da geometria para
         * as ferramentas externas do DentalPos Design.
         *
         * O diagnóstico pode trabalhar nessa cópia
         * sem interferir no modelo exibido.
         */
        onGeometryLoaded?.(
          geometry.clone()
        );

        requestAnimationFrame(
          () => {
            fitModel();

            renderRef.current?.();
          }
        );

        setLoading(
          false
        );
      } catch (error) {
        console.error(
          "DentalPos STL Loader:",
          error
        );

        onGeometryLoaded?.(
          null
        );

        setLoading(
          false
        );
      }
    };

    reader.onerror =
      () => {
        if (!cancelled) {
          console.error(
            "DentalPos: erro ao ler arquivo STL."
          );

          onGeometryLoaded?.(
            null
          );

          setLoading(
            false
          );
        }
      };

    reader.readAsArrayBuffer(
      stlFile
    );

    return () => {
      cancelled =
        true;

      if (
        reader.readyState ===
        FileReader.LOADING
      ) {
        reader.abort();
      }
    };
  }, [
    stlFile,
    onGeometryLoaded,
  ]);


  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;
    const loadAux = (file: File | null, ref: { current: THREE.Mesh | null }, color: number, opacity: number) => {
      if (ref.current) {
        scene.remove(ref.current);
        ref.current.geometry.dispose();
        const m = ref.current.material as THREE.Material;
        m.dispose();
        ref.current = null;
      }
      if (!file) { renderRef.current?.(); return; }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (cancelled || !(event.target?.result instanceof ArrayBuffer)) return;
        try {
          const geometry = new STLLoader().parse(event.target.result);
          geometry.computeVertexNormals(); geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          if (box) { const c = new THREE.Vector3(); box.getCenter(c); geometry.translate(-c.x,-c.y,-c.z); }
          const material = new THREE.MeshStandardMaterial({ color, transparent:true, opacity, roughness:.65, side:THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material); scene.add(mesh); ref.current = mesh; renderRef.current?.();
        } catch (error) { console.error("DentalPos auxiliary STL:", error); }
      };
      reader.readAsArrayBuffer(file);
    };
    loadAux(antagonistFile, antagonistRef, 0x7dd3fc, .42);
    loadAux(biteFile, biteRef, 0xfbbf24, .28);
    return () => { cancelled = true; };
  }, [antagonistFile, biteFile]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (generatedToothRef.current) {
      scene.remove(generatedToothRef.current); generatedToothRef.current.geometry.dispose();
      (generatedToothRef.current.material as THREE.Material).dispose(); generatedToothRef.current = null;
    }
    if (!generatedToothNumber) { renderRef.current?.(); return; }
    const quadrant = Math.floor(generatedToothNumber / 10);
    const position = generatedToothNumber % 10;
    const isUpper = quadrant === 1 || quadrant === 2;
    const posteriorScale = position >= 6 ? 1.3 : position >= 4 ? 1.05 : .82;
    const geometry = new THREE.SphereGeometry(5, 40, 28);
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const ageScale = toothCharacter === "Idoso" ? .92 : toothCharacter === "Jovem" ? 1.05 : 1;
    for (let i=0;i<attr.count;i++) {
      const x=attr.getX(i), y=attr.getY(i), z=attr.getZ(i);
      const crown = 1 + Math.max(0,y/5)*.16;
      attr.setXYZ(i, x*posteriorScale*crown*ageScale, y*(isUpper?1.12:1.02)*ageScale, z*(position>=4?1.18:.82)*crown*ageScale);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({color:0xfff7e6,roughness:.58,metalness:0,side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(geometry,material); mesh.name=`DENTALPOS_LIBRARY_TOOTH_${generatedToothNumber}`;
    mesh.position.set(0, 18, 0); scene.add(mesh); generatedToothRef.current=mesh; renderRef.current?.();
  }, [generatedToothNumber, toothCharacter]);

  useEffect(() => {
    const base=modelRef.current, antagonist=antagonistRef.current, bite=biteRef.current;
    if (!base || !antagonist || !bite || occlusionNonce===0) return;
    const baseBox=new THREE.Box3().setFromObject(base); const antBox=new THREE.Box3().setFromObject(antagonist); const biteBox=new THREE.Box3().setFromObject(bite);
    const baseCenter=new THREE.Vector3(); const antCenter=new THREE.Vector3(); const biteCenter=new THREE.Vector3();
    baseBox.getCenter(baseCenter); antBox.getCenter(antCenter); biteBox.getCenter(biteCenter);
    antagonist.position.x += baseCenter.x-antCenter.x; antagonist.position.z += baseCenter.z-antCenter.z;
    const gap=Math.max(1,biteBox.getSize(new THREE.Vector3()).y*.35);
    antagonist.position.y += (baseBox.max.y + gap) - antBox.min.y;
    bite.position.set(baseCenter.x-biteCenter.x, baseBox.max.y-biteCenter.y+gap*.25, baseCenter.z-biteCenter.z);
    renderRef.current?.();
  }, [occlusionNonce]);


  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!renderer || !camera || !scene) return;
    if (!marginGroupRef.current) {
      const group = new THREE.Group(); group.name = "DENTALPOS_MARGIN_POINTS"; scene.add(group); marginGroupRef.current = group;
    }
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      if (activeTool === "Navegação") return;
      const model = generatedToothRef.current || modelRef.current;
      if (!model) return;
      const rect=canvas.getBoundingClientRect();
      pointer.x=((event.clientX-rect.left)/rect.width)*2-1; pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
      raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObject(model,false)[0];
      if(!hit)return;
      if(activeTool==="Delimitar término"){
        const markerGeometry=new THREE.SphereGeometry(.7,16,12); const markerMaterial=new THREE.MeshBasicMaterial({color:0xef4444});
        const marker=new THREE.Mesh(markerGeometry,markerMaterial); marker.position.copy(hit.point); marginGroupRef.current?.add(marker); renderRef.current?.(); return;
      }
      const geometry=model.geometry; const pos=geometry.getAttribute("position") as THREE.BufferAttribute; let normal=geometry.getAttribute("normal") as THREE.BufferAttribute;
      if(!normal){geometry.computeVertexNormals();normal=geometry.getAttribute("normal") as THREE.BufferAttribute;}
      const localPoint=model.worldToLocal(hit.point.clone()); geometry.computeBoundingSphere(); const radius=Math.max(1,(geometry.boundingSphere?.radius||20)*.09); const strength=(brushStrength/100)*.65;
      const affected:number[]=[];
      for(let i=0;i<pos.count;i++){const dx=pos.getX(i)-localPoint.x,dy=pos.getY(i)-localPoint.y,dz=pos.getZ(i)-localPoint.z;const d=Math.sqrt(dx*dx+dy*dy+dz*dz);if(d<=radius)affected.push(i)}
      if(activeTool==="Suavizar" && affected.length){let ax=0,ay=0,az=0;affected.forEach(i=>{ax+=pos.getX(i);ay+=pos.getY(i);az+=pos.getZ(i)});ax/=affected.length;ay/=affected.length;az/=affected.length;affected.forEach(i=>{const dx=pos.getX(i)-localPoint.x,dy=pos.getY(i)-localPoint.y,dz=pos.getZ(i)-localPoint.z;const d=Math.sqrt(dx*dx+dy*dy+dz*dz);const falloff=Math.max(0,1-d/radius)*strength*.22;pos.setXYZ(i,pos.getX(i)+(ax-pos.getX(i))*falloff,pos.getY(i)+(ay-pos.getY(i))*falloff,pos.getZ(i)+(az-pos.getZ(i))*falloff)});
      } else {
        const sign=activeTool==="Remover"?-1:1; const sculpt=activeTool==="Esculpir"?1.35:1;
        affected.forEach(i=>{const dx=pos.getX(i)-localPoint.x,dy=pos.getY(i)-localPoint.y,dz=pos.getZ(i)-localPoint.z;const d=Math.sqrt(dx*dx+dy*dy+dz*dz);const falloff=Math.max(0,1-d/radius);const amount=sign*strength*sculpt*falloff;pos.setXYZ(i,pos.getX(i)+normal.getX(i)*amount,pos.getY(i)+normal.getY(i)*amount,pos.getZ(i)+normal.getZ(i)*amount)});
      }
      pos.needsUpdate=true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); renderRef.current?.();
    };
    canvas.addEventListener("pointerdown",onPointerDown);
    return()=>canvas.removeEventListener("pointerdown",onPointerDown);
  },[activeTool,brushStrength]);

  const setView = (
    view: ViewName
  ) => {
    const model =
      modelRef.current;

    const camera =
      cameraRef.current;

    const controls =
      controlsRef.current;

    if (
      !model ||
      !camera ||
      !controls
    ) {
      return;
    }

    const box =
      new THREE.Box3()
        .setFromObject(
          model
        );

    const size =
      new THREE.Vector3();

    const center =
      new THREE.Vector3();

    box.getSize(
      size
    );

    box.getCenter(
      center
    );

    const maxDimension =
      Math.max(
        size.x,
        size.y,
        size.z,
        1
      );

    const distance =
      maxDimension *
      2.2;

    camera.up.set(
      0,
      1,
      0
    );

    switch (view) {
      case "top":
        camera.up.set(
          0,
          0,
          -1
        );

        camera.position.set(
          center.x,
          center.y +
            distance,
          center.z
        );

        break;

      case "bottom":
        camera.up.set(
          0,
          0,
          1
        );

        camera.position.set(
          center.x,
          center.y -
            distance,
          center.z
        );

        break;

      case "front":
        camera.position.set(
          center.x,
          center.y,
          center.z +
            distance
        );

        break;

      case "back":
        camera.position.set(
          center.x,
          center.y,
          center.z -
            distance
        );

        break;

      case "left":
        camera.position.set(
          center.x -
            distance,
          center.y,
          center.z
        );

        break;

      case "right":
        camera.position.set(
          center.x +
            distance,
          center.y,
          center.z
        );

        break;

      default:
        camera.position.set(
          center.x +
            maxDimension *
              0.7,
          center.y +
            maxDimension *
              0.65,
          center.z +
            maxDimension *
              1.7
        );

        break;
    }

    controls.target.copy(
      center
    );

    camera.lookAt(
      center
    );

    controls.update();

    renderRef.current?.();
  };

  const toggleWireframe =
    () => {
      const model =
        modelRef.current;

      if (!model) {
        return;
      }

      const next =
        !wireframe;

      setWireframe(
        next
      );

      const oldMaterial =
        model.material;

      model.material =
        createMaterial(
          next
        );

      if (
        Array.isArray(
          oldMaterial
        )
      ) {
        oldMaterial.forEach(
          (item) =>
            item.dispose()
        );
      } else {
        oldMaterial.dispose();
      }

      renderRef.current?.();
    };

  const toggleGrid =
    () => {
      const next =
        !showGrid;

      setShowGrid(
        next
      );

      if (
        gridRef.current
      ) {
        gridRef.current.visible =
          next;
      }

      renderRef.current?.();
    };

  const toggleAxes =
    () => {
      const next =
        !showAxes;

      setShowAxes(
        next
      );

      if (
        axesRef.current
      ) {
        axesRef.current.visible =
          next;
      }

      renderRef.current?.();
    };

  let archCount =
    0;

  if (
    sceneRef.current
  ) {
    sceneRef.current.traverse(
      (object) => {
        if (
          object instanceof
            THREE.Mesh &&
          object.name ===
            "DENTALPOS_SINGLE_ARCH"
        ) {
          archCount +=
            1;
        }
      }
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "100%",
        overflow: "hidden",
        background: "#111722",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform:
            "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          alignItems:
            "center",
          gap: 4,
          maxWidth:
            "calc(100% - 20px)",
          padding: 5,
          overflowX: "auto",
          borderRadius: 8,
          background:
            "rgba(15,23,42,0.86)",
          border:
            "1px solid rgba(71,85,105,0.8)",
          backdropFilter:
            "blur(8px)",
        }}
      >
        <ToolButton
          label="3D"
          onClick={() =>
            setView(
              "perspective"
            )
          }
        />

        <ToolButton
          label="Sup"
          onClick={() =>
            setView("top")
          }
        />

        <ToolButton
          label="Inf"
          onClick={() =>
            setView(
              "bottom"
            )
          }
        />

        <ToolButton
          label="Frente"
          onClick={() =>
            setView(
              "front"
            )
          }
        />

        <ToolButton
          label="Trás"
          onClick={() =>
            setView(
              "back"
            )
          }
        />

        <ToolButton
          label="Dir"
          onClick={() =>
            setView(
              "right"
            )
          }
        />

        <ToolButton
          label="Esq"
          onClick={() =>
            setView(
              "left"
            )
          }
        />

        <ToolButton
          label="Ajustar"
          onClick={
            fitModel
          }
        />
      </div>

      {stlFile && (
        <div
          style={{
            position:
              "absolute",
            top: 58,
            left: 10,
            zIndex: 10,
            padding:
              "6px 9px",
            borderRadius: 7,
            background:
              "rgba(15,23,42,0.88)",
            border:
              archCount ===
              1
                ? "1px solid #22c55e"
                : "1px solid #ef4444",
            color:
              archCount ===
              1
                ? "#86efac"
                : "#fca5a5",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          Arcadas na cena:{" "}
          {archCount}
        </div>
      )}

      <div
        style={{
          position:
            "absolute",
          bottom: 10,
          left: "50%",
          transform:
            "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          alignItems:
            "center",
          gap: 4,
          padding: 5,
          borderRadius: 8,
          background:
            "rgba(15,23,42,0.86)",
          border:
            "1px solid rgba(71,85,105,0.8)",
          backdropFilter:
            "blur(8px)",
        }}
      >
        <ToolButton
          label={
            wireframe
              ? "✓ Malha"
              : "Malha"
          }
          onClick={
            toggleWireframe
          }
        />

        <ToolButton
          label={
            showGrid
              ? "✓ Grade"
              : "Grade"
          }
          onClick={
            toggleGrid
          }
        />

        <ToolButton
          label={
            showAxes
              ? "✓ XYZ"
              : "XYZ"
          }
          onClick={
            toggleAxes
          }
        />

        <ToolButton
          label={
            showInfo
              ? "✓ Info"
              : "Info"
          }
          onClick={() =>
            setShowInfo(
              (value) =>
                !value
            )
          }
        />
      </div>

      {showInfo &&
        meshInfo && (
          <div
            style={{
              position:
                "absolute",
              right: 10,
              bottom: 55,
              zIndex: 10,
              padding:
                "8px 10px",
              borderRadius: 8,
              background:
                "rgba(15,23,42,0.9)",
              border:
                "1px solid #334155",
              color:
                "#cbd5e1",
              fontSize: 9,
              lineHeight:
                1.55,
            }}
          >
            <div
              style={{
                color:
                  "#38bdf8",
                fontWeight:
                  800,
                marginBottom:
                  3,
              }}
            >
              MODELO DIGITAL
            </div>

            <div>
              Triângulos:{" "}
              {meshInfo.triangles.toLocaleString(
                "pt-BR"
              )}
            </div>

            <div>
              X:{" "}
              {meshInfo.width.toFixed(
                2
              )}{" "}
              mm
            </div>

            <div>
              Y:{" "}
              {meshInfo.height.toFixed(
                2
              )}{" "}
              mm
            </div>

            <div>
              Z:{" "}
              {meshInfo.depth.toFixed(
                2
              )}{" "}
              mm
            </div>
          </div>
        )}

      {loading && (
        <div
          style={{
            position:
              "absolute",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            background:
              "rgba(2,6,23,0.58)",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Analisando STL...
        </div>
      )}
    </div>
  );
}

interface ToolButtonProps {
  label: string;
  onClick: () => void;
}

function ToolButton({
  label,
  onClick,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border:
          "1px solid #475569",
        borderRadius: 5,
        padding:
          "4px 7px",
        background:
          "rgba(15,23,42,0.92)",
        color:
          "#e2e8f0",
        cursor:
          "pointer",
        fontSize: 9,
        fontWeight: 700,
        whiteSpace:
          "nowrap",
        lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  );
}