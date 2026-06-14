import "./styles.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-10, 10, 10, -10);
const light = new THREE.DirectionalLight(0xffffff, 10);
light.position.set(1, 1, 1);
scene.add(light);

const mousePosition = new THREE.Vector2();
const radius = 0.2;
camera.position.set(0, 0, 4);
camera.lookAt(0, 0, 0);
const planeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    visible: true,
  })
);
scene.add(planeMesh);

const dot = new THREE.Mesh(
  new THREE.SphereGeometry(radius, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x0000ee, visible: true })
);
scene.add(dot);

//マウス操作
const smpn = 40;
let clicks = 0;
let linecnt = 0;
const lines = [];
const lineobjects = [];
window.addEventListener("mousemove", function (e) {
  mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
  mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
  dot.position.copy(
    new THREE.Vector3(10 * mousePosition.x, 10 * mousePosition.y, 1)
  );
  if (bezier_mode && clicks == 2) {
    const positions = lines[linecnt].attributes.position.array;
    const pointer = new THREE.Vector3(
      10 * mousePosition.x,
      10 * mousePosition.y,
      1
    );
    for (let i = 0; i < smpn; i++) {
      const internalPoint1 = new THREE.Vector3()
        .copy(points_bezier[0])
        .lerp(pointer, i / smpn);
      const internalPoint2 = new THREE.Vector3()
        .copy(pointer)
        .lerp(points_bezier[1], i / smpn);
      const internalPoint3 = new THREE.Vector3()
        .copy(internalPoint1)
        .lerp(internalPoint2, i / smpn);
      positions[i * 3] = internalPoint3.x;
      positions[i * 3 + 1] = internalPoint3.y;
      positions[i * 3 + 2] = internalPoint3.z;
    }
    lines[linecnt].attributes.position.needsUpdate = true;
  }
  if (selected) {
    selectedObj.position.copy(
      new THREE.Vector3(10 * mousePosition.x, 10 * mousePosition.y, 2)
    );
  }
});
const points_bezier = [];
const points_catmull = [];
const dotobjects_bezier = [];
const dotobjects_catmull = [];
let dotcnt_catmull = 0;
let bezier_mode = true;
document.getElementsByName("curvetype").item(0).checked = true;
document.getElementById("genbtn").setAttribute("disabled", true);
document.getElementById("okbtn").style.visibility = "hidden";
let adjustmode = false;
let selected = false;
let selectedObj;
const catmullgen = (e) => {
  e.stopPropagation();
  if (dotcnt_catmull < 4) {
    alert("The number of points must be larger than 3");
    return;
  }
  let smp = [];
  for (let i = 1; i < points_catmull.length - 2; i++) {
    const num = 10;
    const curve_fun = (t) => {
      const t1 = points_catmull[i - 1].x;
      const t2 = points_catmull[i].x;
      const t3 = points_catmull[i + 1].x;
      const t4 = points_catmull[i + 2].x;
      const x1 = points_catmull[i - 1].y;
      const x2 = points_catmull[i].y;
      const x3 = points_catmull[i + 1].y;
      const x4 = points_catmull[i + 2].y;
      const l1 = (1 - (t - t1) / (t2 - t1)) * x1 + (x2 * (t - t1)) / (t2 - t1);
      const l2 = (1 - (t - t2) / (t3 - t2)) * x2 + (x3 * (t - t2)) / (t3 - t2);
      const l3 = (1 - (t - t3) / (t4 - t3)) * x3 + (x4 * (t - t3)) / (t4 - t3);
      const q2 = (1 - (t - t1) / (t3 - t1)) * l1 + (l2 * (t - t1)) / (t3 - t1);
      const q3 = (1 - (t - t2) / (t4 - t2)) * l2 + (l3 * (t - t2)) / (t4 - t2);
      const retv =
        (1 - (t - t2) / (t3 - t2)) * q2 + (q3 * (t - t2)) / (t3 - t2);
      return retv;
    };
    const delta = (points_catmull[i + 1].x - points_catmull[i].x) / num;
    for (let j = 0; j < num; j++) {
      const t = j * delta + points_catmull[i].x;
      smp.push(new THREE.Vector3(t, curve_fun(t), 1));
    }
  }
  const lngeometry = new THREE.BufferGeometry().setFromPoints(smp);
  const line = new THREE.Line(
    lngeometry,
    new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  scene.add(line);
  lines.push(lngeometry);
  lineobjects.push(line);
  adjustmode = true;
  document.getElementById("okbtn").style.visibility = "visible";
};
document.getElementById("genbtn").addEventListener("click", catmullgen);
const raycaster = new THREE.Raycaster();

window.addEventListener("click", (e) => {
  let mode_changed =
    bezier_mode != document.getElementsByName("curvetype").item(0).checked;
  bezier_mode = document.getElementsByName("curvetype").item(0).checked;
  if (mode_changed) {
    console.log(linecnt);
    clicks = 0;
    if (!bezier_mode) {
      dotcnt_catmull = 0;
      document.getElementById("genbtn").removeAttribute("disabled");
    } else {
      if (adjustmode) {
        adjustmode = false;
        scene.remove(lineobjects[linecnt]);
        lineobjects.length--;
        lines.length--;
      }
      dotcnt_catmull = 0;
      document.getElementById("genbtn").setAttribute("disabled", true);
      for (let i = 0; i < dotobjects_catmull.length; i++)
        scene.remove(dotobjects_catmull[i]);
      points_catmull.length = 0;
    }
    return;
  }
  mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
  mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (bezier_mode) {
    if (clicks < 2) {
      const newDot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xee0000, visible: true })
      );
      newDot.position.copy(
        new THREE.Vector3(10 * mousePosition.x, 10 * mousePosition.y, 2)
      );
      points_bezier.push(newDot.position);
      scene.add(newDot);
      dotobjects_bezier.push(newDot);
    }
    clicks++;
    if (clicks == 1) {
      let smp = [];
      for (let i = 0; i <= smpn - 1; i++) smp.push(new THREE.Vector3());
      const lngeometry = new THREE.BufferGeometry().setFromPoints(smp);
      const line = new THREE.Line(
        lngeometry,
        new THREE.LineBasicMaterial({ color: 0x000000 })
      );
      scene.add(line);
      lines.push(lngeometry);
      lineobjects.push(line);
    } else if (clicks == 3) {
      scene.remove(dotobjects_bezier[0]);
      scene.remove(dotobjects_bezier[1]);
      dotobjects_bezier.length = 0;
      points_bezier.length = 0;
      clicks = 0;
      linecnt++;
    }
  } else {
    if (!adjustmode) {
      const newDot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ee00, visible: true })
      );
      newDot.position.copy(
        new THREE.Vector3(10 * mousePosition.x, 10 * mousePosition.y, 2)
      );
      points_catmull.push(newDot.position);
      scene.add(newDot);
      dotobjects_catmull.push(newDot);
      dotcnt_catmull++;
    } else {
      mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mousePosition, camera);
      const intersects = raycaster.intersectObjects(scene.children);
      if (!selected && intersects.length > 0) {
        for (let i = 0; i < dotobjects_catmull.length; i++) {
          if (intersects[0].object == dotobjects_catmull[i]) {
            selectedObj = intersects[0].object;
            selectedObj.material = new THREE.MeshBasicMaterial({
              color: 0xee0000,
            });
            selected = true;
            break;
          }
        }
      } else if (selected) {
        selected = false;
        selectedObj.material = new THREE.MeshBasicMaterial({
          color: 0x00ee00,
        });
        scene.remove(lineobjects[linecnt]);
        lineobjects.length--;
        lines.length--;
        catmullgen(e);
      }
    }
  }
});
document.getElementById("okbtn").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("okbtn").style.visibility = "hidden";
  adjustmode = false;
  linecnt++;
  for (let i = 0; i < dotobjects_catmull.length; i++)
    scene.remove(dotobjects_catmull[i]);
  points_catmull.length = 0;
  dotobjects_catmull.length = 0;
  dotcnt_catmull = 0;
});
//キーボード操作
let ctrl_pushed = false;
let z_pushed = false;
window.addEventListener("keydown", (e) => {
  if (clicks == 2) return;
  if (e.keyCode == 90) z_pushed = true;
  if (e.keyCode == 17) ctrl_pushed = true;
  if (z_pushed && ctrl_pushed) {
    if (linecnt > 0) {
      scene.remove(lineobjects[linecnt - 1]);
      lines.length--;
      lineobjects.length--;
      linecnt--;
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (e.keyCode == 90) z_pushed = false;
  if (e.keyCode == 17) ctrl_pushed = false;
});

scene.add(camera);
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
