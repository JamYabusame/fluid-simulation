import "./styles.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/ window.innerHeight, 1, 2000);
const light = new THREE.DirectionalLight(0xFFFFFF, 2.0);
light.position.set(1, 1, 1);
camera.position.set(2,2,2);

//Make a box
const box1_geo = new THREE.BoxGeometry(1,0.1,1);
const box_mat = new THREE.MeshPhongMaterial({transparent: true, opacity: 0.5,});
const box1_mesh = new THREE.Mesh(box1_geo, box_mat);
const box2_geo = new THREE.BoxGeometry(1,0.5,0.1);
const box3_geo = new THREE.BoxGeometry(0.1,1.0,1.0);
const box4_geo = new THREE.BoxGeometry(0.1,0.5,1.0);
const box2_mesh = new THREE.Mesh(box2_geo, box_mat);
const box3_mesh = new THREE.Mesh(box2_geo, box_mat);
const box4_mesh = new THREE.Mesh(box3_geo, box_mat);
const box5_mesh = new THREE.Mesh(box4_geo, box_mat);
box2_mesh.position.set(0,0.25,0.55);
box3_mesh.position.set(0,0.25,-0.55);
box4_mesh.position.set(0.55,0.5,0);
box5_mesh.position.set(-0.55,0.25,0);
scene.add(box1_mesh);
scene.add(box2_mesh);
scene.add(box3_mesh);
scene.add(box4_mesh);
scene.add(box5_mesh);


camera.lookAt(new THREE.Vector3(0,0,0));
scene.add(light);

const mousePosition = new THREE.Vector2();

window.addEventListener("mousemove", function (e) {

});


window.addEventListener("click", (e) => {

});

scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});