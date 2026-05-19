import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, PerspectiveCamera, Environment, ContactShadows, PresentationControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

interface AvatarProps {
  isSpeaking: boolean;
  isThinking: boolean;
  isLive: boolean;
  isMemoryAction?: boolean;
  volume: number;
}

const AvatarModel = ({ isSpeaking, isThinking, isLive, isMemoryAction, volume }: AvatarProps) => {
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const leftPupilRef = useRef<THREE.Mesh>(null);
  const rightPupilRef = useRef<THREE.Mesh>(null);
  const antennaLeftRef = useRef<THREE.Mesh>(null);
  const antennaRightRef = useRef<THREE.Mesh>(null);
  const leftEyebrowRef = useRef<THREE.Group>(null);
  const rightEyebrowRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  
  const [lookTarget, setLookTarget] = useState(new THREE.Vector3(0, 0, 1));
  const currentLook = useRef(new THREE.Vector3(0, 0, 1));

  // Autonomous "looking around" logic
  useEffect(() => {
    const updateLookTarget = () => {
      if (isThinking || isMemoryAction) {
        setLookTarget(new THREE.Vector3(0, 0.5, 1)); // Look up
      } else if (isSpeaking || isLive) {
        // More focused but still natural
        setLookTarget(new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          1
        ));
      } else {
        // Idle wandering
        setLookTarget(new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 1,
          1
        ));
      }
      setTimeout(updateLookTarget, 2000 + Math.random() * 3000);
    };
    updateLookTarget();
  }, [isThinking, isSpeaking, isLive, isMemoryAction]);

  useFrame((state) => {
    if (!headRef.current) return;

    // Smoothly interpolate current look position
    currentLook.current.lerp(lookTarget, 0.05);

    // Head rotation based on look target
    headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -currentLook.current.y * 0.3, 0.1);
    headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, currentLook.current.x * 0.5, 0.1);

    // Eye flashing effect removed for human-like look
    if (leftPupilRef.current && rightPupilRef.current) {
      // Eyes follow look target slightly more than head
      const eyeX = currentLook.current.x * 0.1;
      const eyeY = currentLook.current.y * 0.1;
      leftPupilRef.current.position.x = THREE.MathUtils.lerp(leftPupilRef.current.position.x, eyeX, 0.1);
      leftPupilRef.current.position.y = THREE.MathUtils.lerp(leftPupilRef.current.position.y, eyeY, 0.1);
      rightPupilRef.current.position.x = THREE.MathUtils.lerp(rightPupilRef.current.position.x, eyeX, 0.1);
      rightPupilRef.current.position.y = THREE.MathUtils.lerp(rightPupilRef.current.position.y, eyeY, 0.1);
    }

    // Mouth animation (Speaking)
    if (mouthRef.current) {
      if (isSpeaking) {
        const targetScale = 0.05 + (volume * 1.5);
        mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, targetScale, 0.3);
      } else {
        mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, 0.02, 0.2);
      }
    }

    // Eyebrow animation (Happy/Friendly)
    if (leftEyebrowRef.current && rightEyebrowRef.current) {
      const eyebrowY = (isThinking || isMemoryAction) ? 0.55 : 0.48;
      const eyebrowRot = (isThinking || isMemoryAction) ? 0.15 : -0.05; // Tilted slightly outwards for happy look
      leftEyebrowRef.current.position.y = THREE.MathUtils.lerp(leftEyebrowRef.current.position.y, eyebrowY, 0.1);
      rightEyebrowRef.current.position.y = THREE.MathUtils.lerp(rightEyebrowRef.current.position.y, eyebrowY, 0.1);
      leftEyebrowRef.current.rotation.z = THREE.MathUtils.lerp(leftEyebrowRef.current.rotation.z, eyebrowRot, 0.1);
      rightEyebrowRef.current.rotation.z = THREE.MathUtils.lerp(rightEyebrowRef.current.rotation.z, -eyebrowRot, 0.1);
    }

    // Breathing movement for head (since body is gone)
    if (headRef.current) {
      headRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }

    // Memory Action Flash Effect
    if (flashRef.current) {
      const material = flashRef.current.material as THREE.MeshStandardMaterial;
      if (isMemoryAction) {
        flashRef.current.scale.setScalar(THREE.MathUtils.lerp(flashRef.current.scale.x, 1.2 + Math.sin(state.clock.elapsedTime * 20) * 0.2, 0.2));
        material.opacity = THREE.MathUtils.lerp(material.opacity, 0.6, 0.2);
      } else {
        flashRef.current.scale.setScalar(THREE.MathUtils.lerp(flashRef.current.scale.x, 0.8, 0.1));
        material.opacity = THREE.MathUtils.lerp(material.opacity, 0, 0.1);
      }
    }
  });

  // Blinking animation
  useEffect(() => {
    const blink = () => {
      if (!leftEyeRef.current || !rightEyeRef.current) return;
      
      const tl = gsap.timeline();
      // Scale Y to 0 for a 2D blink effect
      tl.to([leftEyeRef.current.scale, rightEyeRef.current.scale], {
        y: 0.001,
        duration: 0.08,
        ease: "power2.in"
      }).to([leftEyeRef.current.scale, rightEyeRef.current.scale], {
        y: 1.5, // Return to original elliptical scale
        duration: 0.12,
        ease: "power2.out"
      });

      setTimeout(blink, 3000 + Math.random() * 4000);
    };
    const timeout = setTimeout(blink, 3000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <group>
      {/* Head Group */}
      <group ref={headRef} position={[0, 0, 0]}>
        {/* Square-Circular Head (Rounded Cube) - Reverted Size */}
        <RoundedBox args={[1.2, 1.1, 1]} radius={0.3} smoothness={2}>
          <meshStandardMaterial 
            color="#10b981" 
            emissive="#10b981" 
            emissiveIntensity={isLive ? 0.3 : 0.1} 
            metalness={0.8} 
            roughness={0.2} 
          />
        </RoundedBox>

        {/* Antennae */}
        <group position={[0.4, 0.55, 0]} rotation={[0, 0, -0.2]}>
          <mesh ref={antennaRightRef}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
            <meshStandardMaterial color="#064e3b" />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2} />
          </mesh>
        </group>

        <group position={[-0.4, 0.55, 0]} rotation={[0, 0, 0.2]}>
          <mesh ref={antennaLeftRef}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
            <meshStandardMaterial color="#064e3b" />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2} />
          </mesh>
        </group>

        {/* Eyebrows */}
        <group position={[0.35, 0.38, 0.55]} ref={rightEyebrowRef}>
          <mesh>
            <boxGeometry args={[0.3, 0.05, 0.05]} />
            <meshStandardMaterial color="#064e3b" />
          </mesh>
        </group>
        <group position={[-0.35, 0.38, 0.55]} ref={leftEyebrowRef}>
          <mesh>
            <boxGeometry args={[0.3, 0.05, 0.05]} />
            <meshStandardMaterial color="#064e3b" />
          </mesh>
        </group>

        {/* Small Circular Nose */}
        <mesh position={[0, 0, 0.6]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#064e3b" emissive="#10b981" emissiveIntensity={0.5} />
        </mesh>

        {/* Big 2D Elliptical Eyes (Smarter/Funny Look) */}
        <group position={[0.35, 0.1, 0.52]} ref={rightEyeRef} scale={[1.2, 1.5, 1]}>
          <mesh>
            <circleGeometry args={[0.22, 16]} />
            <meshStandardMaterial color="white" metalness={0.1} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0, 0.01]} ref={rightPupilRef}>
            <circleGeometry args={[0.1, 12]} />
            <meshStandardMaterial color="#000" />
          </mesh>
        </group>

        <group position={[-0.35, 0.1, 0.52]} ref={leftEyeRef} scale={[1.2, 1.5, 1]}>
          <mesh>
            <circleGeometry args={[0.22, 16]} />
            <meshStandardMaterial color="white" metalness={0.1} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0, 0.01]} ref={leftPupilRef}>
            <circleGeometry args={[0.1, 12]} />
            <meshStandardMaterial color="#000" />
          </mesh>
        </group>

        {/* Small Happy Mouth */}
        <mesh position={[0, -0.3, 0.55]} ref={mouthRef} scale={[1.2, 0.02, 1]}>
          <capsuleGeometry args={[0.08, 0.05, 2, 4]} />
          <meshStandardMaterial color="#064e3b" emissive="#10b981" emissiveIntensity={1} />
        </mesh>

        {/* Neural Flash Mesh */}
        <mesh ref={flashRef} scale={[0.8, 0.8, 0.8]}>
          <sphereGeometry args={[1.2, 32, 32]} />
          <meshStandardMaterial 
            color="#10b981" 
            transparent 
            opacity={0} 
            emissive="#10b981" 
            emissiveIntensity={2}
            side={THREE.BackSide}
          />
        </mesh>
      </group>

      {/* Thinking Aura */}
      {isThinking && (
        <mesh position={[0, 0, 0]} scale={[1.5, 1.5, 1.5]}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial 
            color="#10b981" 
            transparent 
            opacity={0.05} 
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </group>
  );
};

export const NovaAvatar = (props: AvatarProps) => {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas 
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]} 
      >
        <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={35} />
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        <PresentationControls
          global
          snap
          rotation={[0, 0, 0]}
          polar={[-Math.PI / 6, Math.PI / 6]}
          azimuth={[-Math.PI / 4, Math.PI / 4]}
        >
          <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
            <AvatarModel {...props} />
          </Float>
        </PresentationControls>

        {props.isMemoryAction && (
          <>
            <pointLight position={[2, 2, 2]} color="#10b981" intensity={10} />
            <pointLight position={[-2, -2, 2]} color="#10b981" intensity={10} />
          </>
        )}

        <ContactShadows position={[0, -1, 0]} opacity={0.4} scale={10} blur={2.5} far={4} />
        <Environment preset="night" />
      </Canvas>
    </div>
  );
};
