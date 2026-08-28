// Shared 2.5D response for the illustrated members.  It keeps the original art
// intact while giving the stacked face/hair planes different inertia and adds
// a clipped, direction-aware light pass like the Gyoza renderer.
export function createDepthRig(size = 1254) {
  const state = { yaw: 0, pitch: 0, yawVelocity: 0, pitchVelocity: 0 };
  const lightCanvas = document.createElement("canvas");
  lightCanvas.width = lightCanvas.height = size;
  const light = lightCanvas.getContext("2d");

  function update(yaw, pitch) {
    state.yawVelocity += (yaw - state.yaw) * 0.055;
    state.pitchVelocity += (pitch - state.pitch) * 0.05;
    state.yawVelocity *= 0.8;
    state.pitchVelocity *= 0.81;
    state.yaw += state.yawVelocity;
    state.pitch += state.pitchVelocity;
    return {
      yaw: state.yaw,
      pitch: state.pitch,
      backX: -state.yaw * 8,
      bodyX: -state.yaw * 2,
      faceX: state.yaw * 16,
      frontX: state.yaw * 25,
      backY: -state.pitch * 3,
      faceY: state.pitch * 7,
      frontY: state.pitch * 10,
      squashX: 1 - Math.abs(state.yaw) * 0.028,
      stretchY: 1 + state.pitch * 0.012,
    };
  }

  function drawLighting(ctx, silhouette, yaw = state.yaw, pitch = state.pitch) {
    const strength = Math.min(1, Math.abs(yaw));
    light.clearRect(0, 0, size, size);
    light.drawImage(silhouette, 0, 0);
    light.globalCompositeOperation = "source-in";
    const from = yaw >= 0 ? size * 0.24 : size * 0.76;
    const to = yaw >= 0 ? size * 0.86 : size * 0.14;
    const shade = light.createLinearGradient(from, size * 0.25, to, size * 0.76);
    shade.addColorStop(0, `rgba(255,247,231,${0.025 + strength * 0.055})`);
    shade.addColorStop(0.48, "rgba(84,54,45,0)");
    shade.addColorStop(1, `rgba(46,29,35,${0.08 + strength * 0.17 + Math.max(0, pitch) * 0.04})`);
    light.fillStyle = shade;
    light.fillRect(0, 0, size, size);
    light.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(lightCanvas, 0, 0);
    ctx.restore();
  }

  return { update, drawLighting };
}
