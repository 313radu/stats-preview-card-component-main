function main() {
    const canvas = document.getElementById("canvas");
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;

    const fov = 45;
    const aspect = 2;
    const near = 0.1;
    const far = 100;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 5, 0);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080816");

    // Custom noise texture for the spheres
    const noiseTexture = createNoiseTexture();

    const sphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            noiseTexture: { value: noiseTexture },
            color1: { value: new THREE.Color("#4b0082").multiplyScalar(1.5) },
            color2: { value: new THREE.Color("#9400d3").multiplyScalar(1.5) },
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color1;
            uniform vec3 color2;
            uniform float time;
            uniform sampler2D noiseTexture;
            
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                float gradientFactor = vUv.y * 0.7 + dot(vNormal, vec3(0.0, 1.0, 0.0)) * 0.3;
                vec2 noiseUv = vUv + time * 0.1;
                vec4 noise = texture2D(noiseTexture, noiseUv);
                vec3 baseColor = mix(color1, color2, smoothstep(0.0, 1.0, gradientFactor));
                float shimmer = noise.r * 0.15 * (1.0 + sin(time * 2.0));
                float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
                vec3 finalColor = baseColor + shimmer + fresnel * 0.8;
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
    });

    function createNoiseTexture() {
        const size = 256;
        const data = new Uint8Array(size * size * 4);
        for(let i = 0; i < size * size * 4; i += 4) {
            const noise = Math.random() * 255;
            data[i] = noise;
            data[i+1] = noise;
            data[i+2] = noise;
            data[i+3] = 255;
        }
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    // Add bloom effect light
    const bloomLight = new THREE.PointLight("#ff69b4", 3, 15);  
    bloomLight.position.set(0, 10, 0);  
    scene.add(bloomLight);

    const plateGeometry = new THREE.PlaneGeometry(50, 50, 32);
    const plateMaterial = new THREE.MeshPhongMaterial({ color: 0x60088d, side: THREE.DoubleSide, shininess: 50 });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.rotation.x = -Math.PI / 2;  
    plate.position.y = -3;            
    scene.add(plate);

    // Add lights to the plate
    const plateLight = new THREE.PointLight(0xffffff, 0.5, 20);  // Soft light for the plate
    plateLight.position.set(0, 0, 0);
    scene.add(plateLight);

    const numSpheres = 10;  
    const sphereShadowBases = [];

    for (let i = 0; i < numSpheres; ++i) {
        const base = new THREE.Object3D();
        scene.add(base);

        const sphereGeo = new THREE.SphereGeometry(1, 64, 64);
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMaterial.clone());
        sphereMesh.position.set(0, 3, 0);
        
        const sphereLight = new THREE.PointLight("#4b0082", 1.8, 6);  
        sphereLight.position.copy(sphereMesh.position);
        base.add(sphereLight);
        
        base.add(sphereMesh);

        sphereShadowBases.push({
            base,
            sphereMesh,
            sphereLight,
            y: sphereMesh.position.y,
            ndx: i,
        });
    }

    // Add ambient light
    const ambientLight = new THREE.AmbientLight("#ffffff", 0.5);
    scene.add(ambientLight);

    function resizeRendererToDisplaySize(renderer) {
        const canvas = renderer.domElement;
        const pixelRatio = window.devicePixelRatio;
        const width = canvas.clientWidth * pixelRatio | 0;
        const height = canvas.clientHeight * pixelRatio | 0;
        const needResize = canvas.width !== width || canvas.height !== height;
        if (needResize) {
            renderer.setSize(width, height, false);
        }
        return needResize;
    }

    let lastFrameTime = 0;
    let deltaTime = 0;

    function animate(time) {
        time *= 0.001;  // Convert to seconds

        if (lastFrameTime !== 0) {
            deltaTime = time - lastFrameTime;
        } else {
            deltaTime = 0;
        }
        lastFrameTime = time;

        if (resizeRendererToDisplaySize(renderer)) {
            const canvas = renderer.domElement;
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }

        bloomLight.position.x = Math.sin(time) * 10;
        bloomLight.position.z = Math.cos(time) * 10;

        const gravity = 9.81;
        const bounceFactor = 0.3; 

        sphereShadowBases.forEach(sphereShadowBase => {
            const { base, sphereMesh, sphereLight, y, ndx } = sphereShadowBase;

            const u = ndx / sphereShadowBases.length;
            const speed = time * 0.5;
            const angle = speed + u * Math.PI * 2 * (ndx % 2 ? 1 : -1);
            const radius = Math.sin(speed - ndx) * 12;

            base.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);

            const yOff = Math.abs(Math.sin(time * 2 + ndx));
            sphereMesh.position.y = Math.max(y + Math.sin(time + ndx) * 3 * yOff - 1, 0); 
            sphereLight.position.copy(sphereMesh.position);

            sphereMesh.position.y -= gravity * deltaTime * 0.04;

            if (sphereMesh.position.y < 0) {
                sphereMesh.position.y = Math.abs(sphereMesh.position.y) * bounceFactor;
            }

            sphereMesh.material.uniforms.time.value = time;
        });

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

main();