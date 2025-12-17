import * as THREE from 'three';

export class TreeGenerator {
    constructor() {
        this.materialTrunk = null;
        this.materialLeaf = null;
        
        // Configuration for different LODs
        this.configs = {
            low: { segments: 4, depth: 3, branchProb: 0.5 },
            med: { segments: 6, depth: 4, branchProb: 0.7 },
            high: { segments: 8, depth: 5, branchProb: 0.8 }
        };
    }

    async loadAssets() {
        const loader = new THREE.TextureLoader();
        const [bark, leaf] = await Promise.all([
            loader.loadAsync('bark.png'),
            loader.loadAsync('leaf.png')
        ]);

        bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
        bark.repeat.set(2, 4);

        this.materialTrunk = new THREE.MeshStandardMaterial({
            map: bark,
            roughness: 0.9,
            color: 0x8B5A2B,
            skinning: true 
        });

        this.materialLeaf = new THREE.MeshStandardMaterial({
            map: leaf,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            color: 0xFFFFFF
        });
    }

    generate(lodLevel = 'med') {
        const config = this.configs[lodLevel];
        const bones = [];
        const positions = [];
        const normals = [];
        const uvs = [];
        const skinIndices = [];
        const skinWeights = [];
        const indices = [];
        
        // Leaf Instance tracking
        const leafMatrices = [];

        // Helper to add a bone
        const createBone = (parent, yPos) => {
            const bone = new THREE.Bone();
            bone.position.y = yPos; // Relative to parent
            if (parent) {
                parent.add(bone);
            }
            bones.push(bone);
            return bone;
        };

        // Recursive branch builder
        // Returns the bone index that tips connect to
        const growBranch = (parentBone, startPoint, length, radius, depth) => {
            const boneIndex = bones.indexOf(parentBone);
            
            // Branch vector logic
            const steps = 3; // Segments per branch for flexibility
            const stepLength = length / steps;
            let currentBone = parentBone;
            let currentRadius = radius;

            // Grow the branch segments
            for (let i = 0; i <= steps; i++) {
                const isTip = (i === steps);
                
                // If not root, we might want to curve slightly? 
                // For simplified rigging, we assume straight segments between bones for now
                // or we add child bones for every segment.
                // Let's add a bone for every segment for smooth bending.
                
                if (i > 0) {
                    const newBone = createBone(currentBone, stepLength);
                    // Add some random rotation to the bone if it's not the base trunk
                    if (depth < config.depth) {
                        newBone.rotation.x = (Math.random() - 0.5) * 0.3;
                        newBone.rotation.z = (Math.random() - 0.5) * 0.3;
                    }
                    currentBone = newBone;
                }

                const boneIdx = bones.indexOf(currentBone);
                const parentBoneIdx = bones.indexOf(currentBone.parent) !== -1 ? bones.indexOf(currentBone.parent) : boneIdx;

                // Create ring of vertices
                const segmentVCount = config.segments;
                const ringStartIdx = positions.length / 3;

                for (let s = 0; s <= segmentVCount; s++) {
                    const theta = (s / segmentVCount) * Math.PI * 2;
                    const x = Math.sin(theta) * currentRadius;
                    const z = Math.cos(theta) * currentRadius;
                    
                    // Vertex is local to the bone binding? 
                    // To construct a single skinned mesh, vertices are usually in Bind Pose (T-Pose).
                    // This is complex procedurally. 
                    // SIMPLIFICATION: We will build the geometry "flat" (straight up) 
                    // and rely on the bone hierarchy structure created simultaneously.
                    
                    // Actually, for SkinnedMesh, vertices must be relative to the Root (World at bind time), 
                    // OR we use the bindMatrix.
                    // The standard Three.js approach: Put geometry in default pose (straight up), 
                    // put bones in default pose (straight up). Then animate bones.
                    
                    // We need to track absolute position for the geometry construction 
                    // if we want the geometry to look like a tree *before* skinning.
                    // But if we want skinning to work easily, we build a straight cylinder and bend bones.
                    // BUT a tree branches out.
                    
                    // SOLUTION: We construct geometry in World Space (Bind Pose).
                    // We calculate the bone transforms in World Space.
                    // We assign weights.
                    
                    // However, calculating world space recursively while building bones is tricky.
                    // Let's use a simpler stack approach.
                    
                    // Current simplified approach:
                    // We just build the geometry relative to the *Bone's local space*? 
                    // No, Three.js SkinnedMesh vertex positions are Model Space.
                    
                    // Let's skip complex bone logic and just do:
                    // 1. We calculate the absolute position of this ring in the tree.
                    // 2. We find the bone closest to it.
                    
                    // Wait, we can't easily calculate absolute position if bones are rotated.
                    // New Strategy: Build the tree geometrically first (using a recursive object approach),
                    // keeping track of 'nodes'. Then convert nodes to bones.
                }
            }
        };
        
        // --- REVISED STRATEGY FOR ROBUSTNESS ---
        // 1. Generate a "skeleton" structure (Node tree) with positions/rotations.
        // 2. Convert Nodes to THREE.Bones.
        // 3. Generate Geometry around the Nodes (Model Space).
        // 4. Assign Skin Indices/Weights based on proximity to Node.

        const nodes = []; // { id, parentId, position (vec3), rotation (euler), radius, depth }
        
        const addNode = (parent, length, radius, depth) => {
            const node = {
                id: nodes.length,
                parent: parent,
                children: [],
                radius: radius,
                depth: depth,
                leaf: false
            };
            
            if (!parent) {
                // Root
                node.position = new THREE.Vector3(0, 0, 0);
                node.rotation = new THREE.Euler(0, 0, 0);
                node.worldPos = new THREE.Vector3(0, 0, 0);
                node.worldQuat = new THREE.Quaternion();
            } else {
                // Child
                node.position = new THREE.Vector3(0, length, 0); // Local to parent
                
                // Random rotation for branches
                if (depth === config.depth) {
                    // Trunk is straighter
                    node.rotation = new THREE.Euler(
                        (Math.random() - 0.5) * 0.1, 
                        (Math.random() - 0.5) * 0.1, 
                        (Math.random() - 0.5) * 0.1
                    );
                } else {
                    // Branches spread out
                    const angle = 0.5 + Math.random() * 0.5;
                    const spin = Math.random() * Math.PI * 2;
                    node.rotation = new THREE.Euler(
                        Math.sin(spin) * angle,
                        Math.random() * 0.5, // twist
                        Math.cos(spin) * angle
                    );
                }

                // Calculate World (Model) Pos for Geometry generation
                const localQuat = new THREE.Quaternion().setFromEuler(node.rotation);
                node.worldQuat = parent.worldQuat.clone().multiply(localQuat);
                
                const rotatedPos = node.position.clone().applyQuaternion(parent.worldQuat);
                node.worldPos = parent.worldPos.clone().add(rotatedPos);
                
                parent.children.push(node);
            }
            
            nodes.push(node);
            
            // Recurse
            if (depth > 0) {
                const branchCount = (depth === config.depth) ? 1 : Math.round(1 + Math.random() * 2);
                const nextLen = length * 0.8;
                const nextRad = radius * 0.7;
                
                for(let i=0; i<branchCount; i++) {
                    if (Math.random() < config.branchProb || i === 0) {
                        addNode(node, nextLen, nextRad, depth - 1);
                    }
                }
            } else {
                // Tip - add leaf info
                node.leaf = true;
                
                // Store matrix for leaf instances
                const dummy = new THREE.Object3D();
                dummy.position.copy(node.worldPos);
                dummy.quaternion.copy(node.worldQuat);
                
                // Add a few leaves per tip
                for(let l=0; l<4; l++) {
                    dummy.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
                    dummy.position.set(
                        node.worldPos.x + (Math.random()-0.5),
                        node.worldPos.y + (Math.random()-0.5),
                        node.worldPos.z + (Math.random()-0.5)
                    );
                    dummy.updateMatrix();
                    leafMatrices.push(dummy.matrix.clone());
                }
            }
        };

        // Start Generation
        addNode(null, 4, 0.4, config.depth);

        // Build Bones from Nodes
        // Helper map
        const nodeBoneMap = new Map();
        
        nodes.forEach(node => {
            const bone = new THREE.Bone();
            bone.position.copy(node.position); // Local pos
            bone.rotation.copy(node.rotation); // Local rot
            
            if (node.parent) {
                const parentBone = nodeBoneMap.get(node.parent.id);
                parentBone.add(bone);
            }
            
            nodeBoneMap.set(node.id, bone);
            bones.push(bone);
        });

        // Build Geometry (Cylinder segments connecting nodes)
        nodes.forEach(node => {
            if (!node.parent) return; // Skip root node geometry start (we draw from parent to child)
            
            const parent = node.parent;
            const radialSegments = config.segments;
            
            // We create a cylinder between parent.worldPos and node.worldPos
            const startPos = parent.worldPos;
            const endPos = node.worldPos;
            
            // Basis vectors for rings
            const diff = new THREE.Vector3().subVectors(endPos, startPos).normalize();
            // Arbitrary perpendicular
            let tempVec = new THREE.Vector3(0, 1, 0);
            if (Math.abs(diff.y) > 0.9) tempVec.set(1, 0, 0);
            const crossA = new THREE.Vector3().crossVectors(diff, tempVec).normalize();
            const crossB = new THREE.Vector3().crossVectors(diff, crossA).normalize();

            // Generate vertices for this segment (Quad tube)
            // Ring 1 (Parent)
            const ring1Idx = positions.length / 3;
            for(let s=0; s<=radialSegments; s++) {
                const angle = (s/radialSegments) * Math.PI * 2;
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);
                
                // Vertex Pos
                const r = parent.radius;
                const x = startPos.x + r * (crossA.x * cos + crossB.x * sin);
                const y = startPos.y + r * (crossA.y * cos + crossB.y * sin);
                const z = startPos.z + r * (crossA.z * cos + crossB.z * sin);
                
                positions.push(x, y, z);
                
                // Normal (approximate)
                const nx = (crossA.x * cos + crossB.x * sin);
                const ny = (crossA.y * cos + crossB.y * sin);
                const nz = (crossA.z * cos + crossB.z * sin);
                normals.push(nx, ny, nz);
                
                uvs.push(s / radialSegments, parent.depth / config.depth);
                
                // Skinning: Rigid bind to Parent Bone
                const boneIndex = bones.indexOf(nodeBoneMap.get(parent.id));
                skinIndices.push(boneIndex, 0, 0, 0);
                skinWeights.push(1, 0, 0, 0);
            }

            // Ring 2 (Child)
            const ring2Idx = positions.length / 3;
            for(let s=0; s<=radialSegments; s++) {
                const angle = (s/radialSegments) * Math.PI * 2;
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);
                
                const r = node.radius;
                const x = endPos.x + r * (crossA.x * cos + crossB.x * sin);
                const y = endPos.y + r * (crossA.y * cos + crossB.y * sin);
                const z = endPos.z + r * (crossA.z * cos + crossB.z * sin);
                
                positions.push(x, y, z);
                
                const nx = (crossA.x * cos + crossB.x * sin);
                const ny = (crossA.y * cos + crossB.y * sin);
                const nz = (crossA.z * cos + crossB.z * sin);
                normals.push(nx, ny, nz);
                
                uvs.push(s / radialSegments, node.depth / config.depth);
                
                // Skinning: Rigid bind to Child Bone
                const boneIndex = bones.indexOf(nodeBoneMap.get(node.id));
                skinIndices.push(boneIndex, 0, 0, 0);
                skinWeights.push(1, 0, 0, 0);
            }

            // Faces
            for(let s=0; s<radialSegments; s++) {
                const a = ring1Idx + s;
                const b = ring1Idx + s + 1;
                const c = ring2Idx + s;
                const d = ring2Idx + s + 1;
                
                indices.push(a, b, d);
                indices.push(d, c, a);
            }
        });

        // Assemble Skinned Mesh
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
        geometry.setIndex(indices);

        const skeleton = new THREE.Skeleton(bones);
        const skinnedMesh = new THREE.SkinnedMesh(geometry, this.materialTrunk);
        skinnedMesh.add(bones[0]); // Add root bone
        skinnedMesh.bind(skeleton);

        // Build Leaves (Instanced Mesh)
        // We use instanced mesh for rendering, but to make them sway with bones, 
        // we'd need to attach them to bones.
        // For simplicity and performance, we'll keep leaves separate but static relative to the tree,
        // OR we can skin them too? Skinning 1000 leaves is heavy. 
        // We will make them a static mesh child of the SkinnedMesh? No, that won't deform.
        // We will make them an InstancedMesh added to the scene, and update their matrices? Too expensive.
        // COMPROMISE: We add the leaves as a static Mesh. The wind shader on the leaves will handle sway visually,
        // while the trunk bends physically via bones. 
        // Actually, if we attach the leaf geometry to the SkinnedMesh geometry, it will deform!
        // But leaves shouldn't stretch.
        
        // Let's create a separate object for leaves as requested ("separate object same color...").
        // To make them move with the tree, we can just skin them rigidly to the closest bone.
        // Yes! Add leaf vertices to the SkinnedMesh geometry or a second SkinnedMesh.
        
        const leafGeo = new THREE.PlaneGeometry(0.5, 0.5);
        const leafPositions = [];
        const leafNormals = [];
        const leafUVs = [];
        const leafIndices = [];
        const leafSkinIndices = [];
        const leafSkinWeights = [];
        
        // Create a merged geometry for leaves
        let leafVertCount = 0;
        
        // Helper to find closest bone
        const findClosestBoneIndex = (pos) => {
             // Optimization: We know which node generated the leaves.
             // We stored matrices. We should store bone index too.
             // Re-doing leaf generation slightly inside the loop above would be cleaner but this is fine.
             let minDist = Infinity;
             let idx = 0;
             for(let i=0; i<bones.length; i++) {
                 // Bones are at worldPos of nodes roughly
                 // This is an approximation since bones moved to local space
                 // But we have nodes[i].worldPos
                 if(i >= nodes.length) break;
                 const d = pos.distanceTo(nodes[i].worldPos);
                 if(d < minDist) {
                     minDist = d;
                     idx = i;
                 }
             }
             return idx;
        };

        leafMatrices.forEach((mat) => {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            mat.decompose(pos, quat, scale);
            
            // Find closest bone for rigging
            const boneIdx = findClosestBoneIndex(pos);
            
            // Add Plane Geometry transformed by matrix
            const posAttr = leafGeo.attributes.position;
            const normAttr = leafGeo.attributes.normal;
            const uvAttr = leafGeo.attributes.uv;
            
            for(let i=0; i<posAttr.count; i++) {
                const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
                v.applyMatrix4(mat);
                leafPositions.push(v.x, v.y, v.z);
                
                const n = new THREE.Vector3().fromBufferAttribute(normAttr, i);
                n.applyQuaternion(quat);
                leafNormals.push(n.x, n.y, n.z);
                
                leafUVs.push(uvAttr.getX(i), uvAttr.getY(i));
                
                leafSkinIndices.push(boneIdx, 0, 0, 0);
                leafSkinWeights.push(1, 0, 0, 0);
            }
            
            const idxAttr = leafGeo.index;
            for(let i=0; i<idxAttr.count; i++) {
                leafIndices.push(idxAttr.getX(i) + leafVertCount);
            }
            leafVertCount += posAttr.count;
        });

        const leafBufferGeo = new THREE.BufferGeometry();
        leafBufferGeo.setAttribute('position', new THREE.Float32BufferAttribute(leafPositions, 3));
        leafBufferGeo.setAttribute('normal', new THREE.Float32BufferAttribute(leafNormals, 3));
        leafBufferGeo.setAttribute('uv', new THREE.Float32BufferAttribute(leafUVs, 2));
        leafBufferGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(leafSkinIndices, 4));
        leafBufferGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(leafSkinWeights, 4));
        leafBufferGeo.setIndex(leafIndices);
        
        const leafSkinnedMesh = new THREE.SkinnedMesh(leafBufferGeo, this.materialLeaf);
        leafSkinnedMesh.bind(skeleton); // Share the skeleton!
        
        // Final container
        const treeGroup = new THREE.Group();
        treeGroup.add(skinnedMesh);
        treeGroup.add(leafSkinnedMesh);
        
        // Expose skeleton for animation
        treeGroup.userData.skeleton = skeleton;
        treeGroup.userData.bones = bones;
        treeGroup.userData.trunkMesh = skinnedMesh;
        treeGroup.userData.leafMesh = leafSkinnedMesh;
        
        return treeGroup;
    }
}

