"use client";

import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Box3, LoopOnce, LoopRepeat, Vector3, type AnimationAction, type AnimationClip, type Group } from "three";

// Local, always-bundled backup mesh. Used only if a provided avatar URL is
// ever empty/unresolvable — keeps a 3D avatar on screen with zero network need.
const DEFAULT_AVATAR_URL = "/models/default_avatar.glb";

interface AvatarPlayerProps {
  animationKey?: string;
  label?: string;
  modelUrl?: string;
  playToken: number;
  idleLabel: string;
  idleModelUrl: string;
  introLabel: string;
  introModelUrl: string;
}

type PlaybackMode = "intro" | "idle" | "action";

interface AvatarErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
}

interface AvatarErrorBoundaryState {
  hasError: boolean;
}

class AvatarErrorBoundary extends Component<AvatarErrorBoundaryProps, AvatarErrorBoundaryState> {
  state: AvatarErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: AvatarErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function hasFacialWeightTrack(clip?: AnimationClip) {
  return Boolean(clip?.tracks.some((track) => track.name.includes("morphTargetInfluences")));
}

function pickPlaybackClipNames(names: string[], actions: Record<string, AnimationAction | null>) {
  const playableNames = names.filter((name) => (actions[name]?.getClip().duration ?? 0) > 0.1);
  const facialClipNames = playableNames.filter((name) => hasFacialWeightTrack(actions[name]?.getClip()));

  if (facialClipNames.length > 0) {
    const facialClipName = facialClipNames.reduce((currentBest, candidate) => {
      const currentDuration = actions[currentBest]?.getClip().duration ?? -1;
      const candidateDuration = actions[candidate]?.getClip().duration ?? -1;
      return candidateDuration > currentDuration ? candidate : currentBest;
    }, facialClipNames[0]);
    const targetDuration = actions[facialClipName]?.getClip().duration ?? 0;

    return playableNames.filter((name) => {
      const duration = actions[name]?.getClip().duration ?? 0;
      return Math.abs(duration - targetDuration) < 0.05;
    });
  }

  const longestClipName = playableNames.reduce((currentBest, candidate) => {
    const currentDuration = actions[currentBest]?.getClip().duration ?? -1;
    const candidateDuration = actions[candidate]?.getClip().duration ?? -1;
    return candidateDuration > currentDuration ? candidate : currentBest;
  }, playableNames[0] ?? "");

  return longestClipName ? [longestClipName] : [];
}

function AvatarModel({
  modelUrl,
  animationKey,
  loop,
  onPlaybackStatus,
  onClipDuration,
}: {
  modelUrl: string;
  animationKey: string;
  loop: boolean;
  onPlaybackStatus: (status: "playing" | "static") => void;
  onClipDuration: (duration: number) => void;
}) {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(modelUrl);
  const { actions, names } = useAnimations(gltf.animations, groupRef);

  useLayoutEffect(() => {
    gltf.scene.position.set(0, 0, 0);
    gltf.scene.rotation.set(0, 0, 0);
    gltf.scene.scale.setScalar(1);

    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = size.y > 0 ? 2.45 / size.y : 1;

    gltf.scene.scale.setScalar(scale);
    gltf.scene.position.set(
      -center.x * scale,
      -box.min.y * scale,
      -center.z * scale,
    );
  }, [gltf.scene, modelUrl]);

  useEffect(() => {
    Object.values(actions).forEach((existingAction) => existingAction?.stop());

    const playbackClipNames = pickPlaybackClipNames(names, actions);
    const playbackActions = playbackClipNames
      .map((name) => actions[name])
      .filter((action): action is AnimationAction => Boolean(action));

    if (playbackActions.length === 0) {
      onPlaybackStatus("static");
      return undefined;
    }

    onPlaybackStatus("playing");
    let longestDuration = 0;
    playbackActions.forEach((action) => {
      longestDuration = Math.max(longestDuration, action.getClip().duration || 0);
      action.reset();
      action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      action.fadeIn(0.15).play();
    });
    onClipDuration(longestDuration || 2);

    return () => {
      playbackActions.forEach((action) => {
        action.fadeOut(0.15);
        action.stop();
      });
    };
  }, [actions, names, animationKey, loop, modelUrl, onClipDuration, onPlaybackStatus]);

  return (
    <group ref={groupRef} position={[0, -0.15, 0]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function SafeEnvironment() {
  // The drei `city` preset streams an HDR environment map from a remote CDN.
  // Offline that request fails; this dedicated boundary (plus its own Suspense)
  // isolates the failure so it can never tear down the avatar Canvas — the
  // scene simply falls back to the local ambient/directional lights already
  // present in the tree. Online behaviour is unchanged.
  return (
    <AvatarErrorBoundary resetKey="environment" fallback={null}>
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
    </AvatarErrorBoundary>
  );
}

function AvatarFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[170px] flex-col items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 text-center">
      <div className="h-10 w-10 rounded-full border border-amber-400/30 bg-amber-500/10" />
      <p className="text-[12px] font-semibold text-amber-200">{message}</p>
      <p className="text-[10px] text-slate-500">Doctor message is still visible in the response panel.</p>
    </div>
  );
}

export default function AvatarPlayer({
  animationKey = "",
  label = "",
  modelUrl = "",
  playToken,
  idleLabel,
  idleModelUrl,
  introLabel,
  introModelUrl,
}: AvatarPlayerProps) {
  const [assetStatus, setAssetStatus] = useState<"checking" | "ready" | "missing">("checking");
  const [playbackStatus, setPlaybackStatus] = useState<"playing" | "static">("playing");
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(introModelUrl ? "intro" : "idle");
  const lastPlayTokenRef = useRef(playToken);
  const idleTimerRef = useRef<number | null>(null);

  const activeModelUrl =
    (playbackMode === "intro"
      ? introModelUrl
      : playbackMode === "action" && modelUrl
        ? modelUrl
        : idleModelUrl) || DEFAULT_AVATAR_URL;
  const activeLabel =
    playbackMode === "intro"
      ? introLabel
      : playbackMode === "action" && label
        ? label
        : idleLabel;
  const activeAnimationKey =
    playbackMode === "intro"
      ? "hello"
      : playbackMode === "action" && animationKey
        ? animationKey
        : "stand_still";
  const shouldLoop = playbackMode === "idle";

  useEffect(() => {
    [idleModelUrl, introModelUrl, modelUrl, DEFAULT_AVATAR_URL].filter((url): url is string => Boolean(url)).forEach((url) => {
      useGLTF.preload(url);
    });
  }, [idleModelUrl, introModelUrl, modelUrl]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  useEffect(() => {
    if (playToken === lastPlayTokenRef.current) return;
    lastPlayTokenRef.current = playToken;
    if (!modelUrl) return;

    clearIdleTimer();
    setPlaybackMode("action");
  }, [clearIdleTimer, modelUrl, playToken]);

  const handleClipDuration = useCallback((duration: number) => {
    clearIdleTimer();
    if (playbackMode === "idle") return;

    const durationMs = Math.min(Math.max(duration * 1000 + 350, 1800), 8500);
    idleTimerRef.current = window.setTimeout(() => {
      setPlaybackMode("idle");
    }, durationMs);
  }, [clearIdleTimer, playbackMode]);

  useEffect(() => {
    let cancelled = false;

    if (!activeModelUrl) {
      setAssetStatus("missing");
      return undefined;
    }

    setAssetStatus("checking");
    fetch(activeModelUrl, { method: "HEAD" })
      .then((response) => {
        if (!cancelled) setAssetStatus(response.ok ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setAssetStatus("missing");
      });

    return () => {
      cancelled = true;
    };
  }, [activeModelUrl]);

  useEffect(() => {
    if (assetStatus === "missing" && playbackMode !== "idle") {
      setPlaybackMode("idle");
    }
  }, [assetStatus, playbackMode]);

  if (assetStatus === "missing") {
    return (
      <div className="h-full">
        <AvatarFallback message="Avatar animation not available for this response." />
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[280px] overflow-hidden rounded-lg border border-teal-500/20 bg-slate-950/70">
      <div className="absolute left-3 top-3 z-10 rounded-full border border-teal-500/25 bg-slate-950/80 px-3 py-1 text-[10px] font-semibold text-teal-200">
        {assetStatus === "checking"
          ? "Loading avatar..."
          : playbackMode === "idle"
            ? `Stand still: ${idleLabel}`
            : playbackStatus === "playing"
              ? `Playing: ${activeLabel}`
            : "Avatar animation not available for this response."}
      </div>
      {assetStatus === "ready" ? (
        <AvatarErrorBoundary
          resetKey={`${activeAnimationKey}:${playToken}:${activeModelUrl}`}
          fallback={<AvatarFallback message="Avatar animation not available for this response." />}
        >
          <Canvas camera={{ position: [0, 1.48, 2.55], fov: 42 }} dpr={[1, 1.5]}>
            <ambientLight intensity={1.1} />
            <directionalLight position={[2, 4, 3]} intensity={1.3} />
            <Suspense fallback={null}>
              <AvatarModel
                key={`${activeAnimationKey}:${playToken}:${activeModelUrl}:${playbackMode}`}
                modelUrl={activeModelUrl}
                animationKey={`${activeAnimationKey}:${playToken}:${playbackMode}`}
                loop={shouldLoop}
                onClipDuration={handleClipDuration}
                onPlaybackStatus={setPlaybackStatus}
              />
              <SafeEnvironment />
            </Suspense>
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              minPolarAngle={1.0}
              maxPolarAngle={1.7}
              target={[0, 1.45, 0]}
            />
          </Canvas>
        </AvatarErrorBoundary>
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
          Loading avatar animation...
        </div>
      )}
    </div>
  );
}
