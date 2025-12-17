import * as THREE from 'three';

export class LeafSystem {
    constructor(scene, leafTexture) {
        this.scene = scene;
        this.leaves = [];
        this.active = true;
        
        const geometry = new THREE.PlaneGeometry(0.3, 0.3);
        const material = new THREE.MeshStandardMaterial({
            map: leafTexture,
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });
        
        // Instanced mesh for performance? 
        // We need individual physics, so InstancedMesh with dynamic update is best.
        this.count = 200;
        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.mesh);
        
        this.dummy = new THREE.Object3D();
        
        // Physics data
        this.data = [];
        for(let i=0; i<this.count; i++) {
            this.data.push({
                pos: new THREE.Vector3(0, -100, 0), // Start hidden
                vel: new THREE.Vector3(),
                rotVel: new THREE.Vector3(),
                active: false
            });
        }
    }
    
    emit(sourceBounds) {
        if (!this.active) return;
        
        // Find inactive leaf
        const particle = this.data.find(p => !p.active);
        if (particle) {
            particle.active = true;
            
            // Random start position within tree bounds (approximate canopy)
            const theta = Math.random() * Math.PI * 2;
            const r = Math.random() * 3;
            particle.pos.set(
                Math.cos(theta) * r,
                4 + Math.random() * 3, // Height
                Math.sin(theta) * r
            );
            
            particle.vel.set(
                (Math.random() - 0.5) * 0.1,
                -0.02 - Math.random() * 0.05,
                (Math.random() - 0.5) * 0.1
            );
            
            particle.rotVel.set(
                Math.random() * 0.1,
                Math.random() * 0.1,
                Math.random() * 0.1
            );
            
            // Random initial rotation
            this.dummy.position.copy(particle.pos);
            this.dummy.rotation.set(Math.random(), Math.random(), Math.random());
            this.dummy.updateMatrix();
        }
    }
    
    update(dt, windStrength) {
        let activeCount = 0;
        
        for(let i=0; i<this.count; i++) {
            const p = this.data[i];
            
            if (p.active) {
                // Gravity + Wind
                p.pos.add(p.vel);
                p.pos.x += Math.sin(Date.now() * 0.001 + p.pos.y) * 0.01 * windStrength;
                p.pos.z += Math.cos(Date.now() * 0.0013 + p.pos.y) * 0.01 * windStrength;
                
                // Rotation
                this.dummy.rotation.x += p.rotVel.x;
                this.dummy.rotation.y += p.rotVel.y;
                this.dummy.rotation.z += p.rotVel.z;
                
                // Ground check
                if (p.pos.y < 0) {
                    p.active = false;
                    p.pos.y = -100;
                }
                
                this.dummy.position.copy(p.pos);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
                activeCount++;
            } else {
                // Hide
                this.dummy.position.set(0, -100, 0);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
            }
        }
        
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

