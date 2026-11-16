// GLSL for the ORYZO stage. Colours are written out display-ready (gamma applied in the shader),
// so the materials using these must not go through three's output colour conversion.

export const HAND_BONES = 36;

/** Soft rainbow used for the "Powered by AI" highlight pass. */
const rainbow = /* glsl */ `
  vec3 rainbow(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }
`;

export const coasterVertex = /* glsl */ `
  attribute float Cd;
  varying vec3 vViewNormal;
  varying vec2 vUv;
  varying vec3 vModelPosition;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vAo;
  uniform float uZoom;
  uniform vec2 uZoomCenter;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_Position.xyz /= gl_Position.w;
    gl_Position.xy = (gl_Position.xy - uZoomCenter) * uZoom + uZoomCenter;
    gl_Position.xyz *= gl_Position.w;
    vViewNormal = normalMatrix * normal;
    vUv = uv * 3.0;
    vModelPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vViewPosition = -viewPosition.xyz;
    vAo = Cd;
  }
`;

// Image-based lighting from two RGBM environment maps that cross-fade between the desk and the
// dark "hand" set, a bump from the cork height map, and a ray-marched soft self-shadow against
// an analytic model of the coaster (three capped cones).
export const coasterFragment = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec2 vUv;
  varying vec3 vModelPosition;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vAo;
  uniform sampler2D uDiffuse;
  uniform sampler2D uHeight;
  uniform sampler2D uEnv1;
  uniform sampler2D uEnv2;
  uniform sampler2D uBrdf;
  uniform float uEnvBlend;
  uniform vec3 uLocalLight;
  uniform float uHighlight;
  uniform float uExtraBump;
  uniform float uHeroRatio;
  uniform float uTime;
  uniform float uWrapperRatio;
  uniform float uWearableBlend;

  ${rainbow}

  float dot2(vec2 v) { return dot(v, v); }
  float sdCappedCone(vec2 q, float h, float r1, float r2) {
    vec2 k1 = vec2(r2, h);
    vec2 k2 = vec2(r2 - r1, 2.0 * h);
    vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
    vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot2(k2), 0.0, 1.0);
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s * sqrt(min(dot2(ca), dot2(cb)));
  }
  float map(in vec3 pos) {
    vec2 q = vec2(length(pos.xz), pos.y);
    float c1 = sdCappedCone(q + vec2(0.0, -0.0102), 0.007, 0.0412, 0.0446);
    float c2 = sdCappedCone(q + vec2(0.0, -0.0016), 0.0015, 0.0385, 0.039);
    float c3 = sdCappedCone(q + vec2(0.0, -0.0155), 0.008, 0.038, 0.0395);
    return max(-c3, min(c1, c2));
  }
  float calcSoftshadow(in vec3 ro, in vec3 rd, float mint, float maxt, float w) {
    float res = 1.0;
    float t = mint;
    for (int i = 0; i < 16 && t < maxt; i++) {
      float h = map(ro + t * rd);
      res = min(res, h / (w * t));
      t += clamp(h, 0.0001, 0.1);
      if (res < -1.0 || t > maxt) break;
    }
    res = max(res, -1.0);
    res = 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
    return res * res * (3.0 - 2.0 * res);
  }
  vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy) {
    vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
    vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
    vec3 vN = surf_norm;
    vec3 R1 = cross(vSigmaY, vN);
    vec3 R2 = cross(vN, vSigmaX);
    float fDet = dot(vSigmaX, R1);
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }
  vec2 cart2Polar(vec3 n) {
    return vec2(atan(n.z, n.x) * 0.15915494 + 0.5, asin(clamp(n.y, -1.0, 1.0)) * 0.31830988618 + 0.5);
  }
  vec3 envLight(vec3 dir) {
    vec2 uv = cart2Polar(dir);
    vec4 a = texture2D(uEnv1, uv);
    vec4 b = texture2D(uEnv2, uv);
    return mix(a.rgb * a.a, b.rgb * b.a, uEnvBlend) * 20.0;
  }
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec3 texel = texture2D(uDiffuse, vUv).rgb;
    float height = texture2D(uHeight, vUv).r;
    vec3 albedo = pow(texel, vec3(mix(2.0, 1.85, uHeroRatio)));

    float bumpScale = 1.0 + 0.5 * max(uHighlight, uWrapperRatio) + uExtraBump;
    vec2 dSTdx = dFdx(vUv);
    vec2 dSTdy = dFdy(vUv);
    vec2 dHdxy = (vec2(texture2D(uHeight, vUv + dSTdx).r, texture2D(uHeight, vUv + dSTdy).r) - height) * bumpScale;
    vec3 viewNormal = perturbNormalArb(-vViewPosition, normalize(vViewNormal), dHdxy);

    vec3 N = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 reflection = normalize(reflect(-V, N));
    float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);

    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = albedo * (vec3(1.0) - f0);
    vec3 brdf = texture2D(uBrdf, vec2(NdV, 1.0)).rgb;
    vec3 diffuseLight = envLight(N);
    vec3 specularLight = envLight(reflection);

    float shadow = calcSoftshadow(vModelPosition, normalize(uLocalLight), 0.00001, 0.08, mix(1.0, 0.5, max(uHighlight, uWrapperRatio)));

    vec3 sheen = mix(vec3(1.0), 0.5 + 0.5 * rainbow(4.0 * (vModelPosition.x + vModelPosition.y) * 8.0 - uTime), uHighlight);
    vec3 color = sheen * (diffuseColor * diffuseLight + specularLight * (f0 * brdf.x + brdf.y));

    // Two coloured lights sweep in for the highlight moment.
    vec3 L0 = normalize(100.0 * vec3(0.8, -0.9, -0.05) - vWorldPosition);
    color += rainbow(vModelPosition.z * 16.0 - uTime) * 4.0 * uHighlight * albedo * max(0.0, dot(N, L0));
    vec3 L1 = normalize(100.0 * vec3(-0.7, -0.5, -0.2) - vWorldPosition);
    color += rainbow(vModelPosition.z * 16.0 + uTime + 0.5) * 4.0 * uHighlight * albedo * max(0.0, dot(N, L1));

    shadow = mix(shadow, 0.6 + 0.4 * shadow, uHeroRatio);
    color *= shadow * shadow * (0.8 + 0.2 * vAo);
    color *= mix(1.0, 0.75, uHeroRatio);
    color += mix(0.05, 0.1, uHeroRatio) * albedo;
    color += albedo * 0.4 * uWrapperRatio;
    // On the jacket the coaster takes a flatter, photographic look to sit in the picture.
    vec3 wearableColor = 4.0 * pow(texel, vec3(3.0 - 0.5 * vAo)) * (0.05 + 0.95 * smoothstep(0.0, 0.3, shadow * shadow));
    color = mix(color, wearableColor, uWearableBlend);

    gl_FragColor = vec4(pow(aces(color), vec3(1.0 / 2.2)), 1.0);
  }
`;

export const handVertex = /* glsl */ `
  attribute vec4 boneIndices;
  attribute vec4 boneWeights;
  attribute vec4 fingerWeights;
  uniform sampler2D uSkinPosition;
  uniform sampler2D uSkinOrient;
  uniform vec2 uUvOffset1;
  uniform vec2 uUvOffset2;
  varying vec2 vUv1;
  varying vec2 vUv2;
  varying vec4 vFingerWeights;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vModelPosition;

  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void applySkin(inout vec3 pos, inout vec3 nor, float boneIndex, float boneWeight) {
    vec2 skinUv = vec2((boneIndex + 0.5) / ${HAND_BONES}.0, 0.5);
    vec4 quat = texture2D(uSkinOrient, skinUv);
    pos += (qrotate(quat, position) + texture2D(uSkinPosition, skinUv).xyz) * boneWeight;
    nor += qrotate(quat, normal) * boneWeight;
  }
  void main() {
    vec3 pos = vec3(0.0);
    vec3 nor = vec3(0.0);
    applySkin(pos, nor, boneIndices.x, boneWeights.x);
    applySkin(pos, nor, boneIndices.y, boneWeights.y);
    applySkin(pos, nor, boneIndices.z, boneWeights.z);
    applySkin(pos, nor, boneIndices.w, boneWeights.w);
    vUv1 = uv * 0.5 + uUvOffset1;
    vUv2 = uv * 0.5 + uUvOffset2;
    vFingerWeights = fingerWeights;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * nor);
    vModelPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const handFragment = /* glsl */ `
  uniform sampler2D uHandTexture;
  uniform float uUvBlend;
  uniform float uOpacity;
  uniform float uHighlight;
  uniform float uTime;
  uniform vec4 uFingerWeights;
  uniform vec2 uResolution;
  varying vec2 vUv1;
  varying vec2 vUv2;
  varying vec4 vFingerWeights;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vModelPosition;

  ${rainbow}

  void main() {
    // The texture is a 2x2 sheet of baked lighting states; hovered fingers light up via the second sample.
    float blend = max(min(1.0, dot(uFingerWeights, vFingerWeights)), uUvBlend);
    vec3 albedo = mix(texture2D(uHandTexture, vUv1).rgb, texture2D(uHandTexture, vUv2).rgb, blend);
    float luma = dot(albedo, vec3(0.2126, 0.7152, 0.0722));

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 c0 = rainbow(vModelPosition.y * 4.0 - uTime);
    vec3 c1 = rainbow(vModelPosition.z * 4.0 + uTime + 0.5);
    vec3 color = albedo + uHighlight * albedo * mix(c0, c1, 0.5);

    // Coloured speculars for the highlight moment.
    float lightIntensity = 300.0 * uHighlight;
    vec3 L = normalize(100.0 * vec3(0.8, -0.9, -0.05) - vWorldPosition);
    float spec = pow(max(0.0, dot(N, normalize(V + L))), 50.0);
    color += c0 * 0.4 * lightIntensity * luma * max(0.0, dot(N, L)) * spec;
    L = normalize(100.0 * vec3(-0.7, -0.5, -0.2) - vWorldPosition);
    spec = pow(max(0.0, dot(N, normalize(V + L))), 50.0);
    color += c1 * lightIntensity * luma * max(0.0, dot(N, L)) * spec;

    // Fade in from the bottom of the screen.
    float screenY = gl_FragCoord.y / uResolution.y;
    float opacity = smoothstep(0.0, 1.0, uOpacity * 2.0 - (0.5 - min(0.5, screenY) * 2.0));
    gl_FragColor = vec4(color, opacity);
  }
`;

export const propVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const propFragment = /* glsl */ `
  uniform sampler2D uColor;
  uniform sampler2D uAlpha;
  uniform float uOpacity;
  uniform float uShadow;
  uniform float uVariant;
  varying vec2 vUv;
  void main() {
    // The colour sheet holds lighting variants side by side; uVariant slides between the first three
    // as the prop rotates, so its highlights shift like a real object under a fixed lamp.
    float v = clamp(uVariant, 0.0, 2.0);
    float i = floor(v);
    vec3 a = texture2D(uColor, vec2((vUv.x + i) * 0.25, vUv.y)).rgb;
    vec3 b = texture2D(uColor, vec2((vUv.x + min(i + 1.0, 2.0)) * 0.25, vUv.y)).rgb;
    vec3 color = mix(a, b, v - i);
    float alpha = texture2D(uAlpha, vUv).r;
    gl_FragColor = vec4(mix(color, vec3(0.0), uShadow), alpha * uOpacity * mix(1.0, 0.35, uShadow));
  }
`;

// ---------- Wearable intro: the foil wrapper the coaster bursts out of ----------

// The tear is a baked simulation: 1024 "bones" x 32 frames stored in a texture, two texels per
// bone for position and two for orientation (16-bit values split across texel pairs).
export const wrapperVertex = /* glsl */ `
  attribute float side;
  attribute vec4 boneIndices;
  attribute vec4 boneWeights;
  uniform sampler2D uAnimTexture;
  uniform vec2 uAnimTexelSize;
  uniform vec3 uAnimBlend;
  uniform float uIsBack;
  uniform float uOffset;
  uniform vec3 uPMin;
  uniform vec3 uPMax;
  uniform vec4 uOrientMin;
  uniform vec4 uOrientMax;
  uniform vec4 uUvMap;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  const vec2 unpackFactors = vec2(1.0 / 256.0, 255.0 / 256.0);
  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void computeSkin(inout vec3 p, inout vec3 n, vec2 xy, float w) {
    vec3 p0 = texture2D(uAnimTexture, xy * uAnimTexelSize).xyz;
    vec3 p1 = texture2D(uAnimTexture, (xy + vec2(1.0, 0.0)) * uAnimTexelSize).xyz;
    vec4 o0 = texture2D(uAnimTexture, (xy + vec2(0.0, 1.0)) * uAnimTexelSize);
    vec4 o1 = texture2D(uAnimTexture, (xy + 1.0) * uAnimTexelSize);
    vec3 bp = mix(uPMin, uPMax, p0 * unpackFactors.x + p1 * unpackFactors.y);
    vec4 bo = mix(uOrientMin, uOrientMax, o0 * unpackFactors.x + o1 * unpackFactors.y);
    p += (qrotate(bo, position) + bp) * w;
    n += qrotate(bo, normal) * w;
  }
  void skinAt(float row, out vec3 pos, out vec3 nor) {
    pos = vec3(0.0);
    nor = vec3(0.0);
    vec2 xy = vec2(0.5, row + 0.5);
    computeSkin(pos, nor, xy + vec2(boneIndices.x * 2.0, 0.0), boneWeights.x);
    computeSkin(pos, nor, xy + vec2(boneIndices.y * 2.0, 0.0), boneWeights.y);
    computeSkin(pos, nor, xy + vec2(boneIndices.z * 2.0, 0.0), boneWeights.z);
    computeSkin(pos, nor, xy + vec2(boneIndices.w * 2.0, 0.0), boneWeights.w);
    nor = normalize(nor);
  }
  void main() {
    vec3 posFrom; vec3 norFrom; vec3 posTo; vec3 norTo;
    skinAt(uAnimBlend.x, posFrom, norFrom);
    skinAt(uAnimBlend.y, posTo, norTo);
    vec3 pos = mix(posFrom, posTo, uAnimBlend.z);
    pos.x += side * uOffset * 0.5;
    pos.z += uOffset * 2.0;
    vec3 nor = normalize(mix(norFrom, norTo, uAnimBlend.z));
    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -viewPosition.xyz;
    vViewNormal = normalMatrix * nor;
    gl_Position = projectionMatrix * viewPosition;
    gl_Position.z += (uIsBack - 0.5) * 0.2 * gl_Position.w;
    vUv = (position.xy - uUvMap.xy) / uUvMap.zw;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  }
`;

// Crinkles come from "harmonics" textures: per-texel cosine waves whose phase advances with the
// tear, so the foil's creases shift as it deforms. Define IS_BACK for the printed inner side.
export const wrapperFragment = /* glsl */ `
  uniform float uOpacity;
  uniform float uHarmonicsTime;
  uniform sampler2D uBase;
  uniform sampler2D uHarmonics0;
  uniform sampler2D uHarmonics1;
  uniform float uHarmonicsStrength;
  uniform sampler2D uNormalMap;
  uniform sampler2D uEnv;
  uniform sampler2D uPattern;
  uniform sampler2D uSpecEnv;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;

  const float TAU = 6.283185307179586;
  float calcHarmonic(float amp, float pha, float freq, float t) {
    return cos(t * freq + (pha - 0.5) * TAU) * amp;
  }
  float pairHarmonics(sampler2D tex, vec2 uv, vec2 freq, float t, float s) {
    vec4 h = texture2D(tex, uv);
    return (calcHarmonic(h.r, h.g, freq.x, t) + calcHarmonic(h.b, h.a, freq.y, t)) * s;
  }
  float getAO(vec2 uv) {
    vec4 r = texture2D(uBase, uv);
    return r.r + calcHarmonic(r.g, r.b, 1.0, uHarmonicsTime) * uHarmonicsStrength
      + pairHarmonics(uHarmonics0, uv, vec2(2.0, 3.0), uHarmonicsTime, uHarmonicsStrength)
      + pairHarmonics(uHarmonics1, uv, vec2(4.0, 5.0), uHarmonicsTime, uHarmonicsStrength);
  }
  mat3 getTangentFrame(vec3 eye_pos, vec3 surf_norm, vec2 uv) {
    vec3 q0 = dFdx(eye_pos.xyz);
    vec3 q1 = dFdy(eye_pos.xyz);
    vec2 st0 = dFdx(uv.st);
    vec2 st1 = dFdy(uv.st);
    vec3 N = surf_norm;
    vec3 q1perp = cross(q1, N);
    vec3 q0perp = cross(N, q0);
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max(dot(T, T), dot(B, B));
    float scale = (det == 0.0) ? 0.0 : inversesqrt(det);
    return mat3(T * scale, B * scale, N);
  }
  vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy) {
    vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
    vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
    vec3 R1 = cross(vSigmaY, surf_norm);
    vec3 R2 = cross(surf_norm, vSigmaX);
    float fDet = dot(vSigmaX, R1);
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }
  vec2 cart2Polar(vec3 n) {
    return vec2(atan(n.z, n.x) * 0.15915494 + 0.5, asin(clamp(n.y, -1.0, 1.0)) * 0.31830988618 + 0.5);
  }
  vec3 rgbm(vec4 c) {
    return c.rgb * c.a * 20.0;
  }
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    return clamp(ACESOutputMat * RRTAndODTFit(ACESInputMat * color), 0.0, 1.0);
  }

  void main() {
    float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
    float normalMask = max(smoothstep(0.792, 0.793, 2.0 * abs(vUv.x - 0.5)), smoothstep(0.792, 0.793, 2.0 * abs(vUv.y - 0.5)));
    vec3 viewNormal = normalize(vViewNormal) * faceDirection;
    vec2 normalUv = 90.0 * vUv;
    mat3 tbn = getTangentFrame(-vViewPosition, viewNormal, normalUv);
    vec3 normalTexture = texture2D(uNormalMap, normalUv).xyz * 2.0 - 1.0;
    normalTexture.xy *= -0.25 * normalMask;
    vec3 perturbedNormal = normalize(tbn * normalize(normalTexture));

    float ao = getAO(vUv);
    vec2 dSTdx = dFdx(vUv) * 2.0;
    vec2 dSTdy = dFdy(vUv) * 2.0;
    vec2 dHdxy = vec2(getAO(vUv + dSTdx), getAO(vUv + dSTdy)) - ao;
    perturbedNormal = perturbNormalArb(-vViewPosition, perturbedNormal, dHdxy);

    vec3 N = normalize((vec4(perturbedNormal, 0.0) * viewMatrix).xyz);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 reflection = normalize(reflect(-V, N));
    #ifdef IS_BACK
      vec3 albedo = uColor;
      vec2 patternUv = mat2(1.0, -2.0, 1.0, 2.0) * sqrt(2.0) * vUv * 0.86;
      float pattern = texture2D(uPattern, patternUv).r;
      albedo = mix(albedo, vec3(1.0), pattern);
      vec3 color = 0.5 * albedo;
      color *= ao;
      color = aces(clamp(color, 0.0, 1.0));
      float alpha = uOpacity;
    #else
      // Clear film over the printed back: it mostly adds crease shading and sharp reflections,
      // so it is blended in only where the reflection is bright.
      vec3 diffuseLight = rgbm(texture2D(uEnv, cart2Polar(N)));
      float reverseAo = pow(1.0 - ao, 3.0);
      float blurAmount = 1.0 - abs(perturbedNormal.z);
      vec3 specularLight = texture2D(uSpecEnv, cart2Polar(reflection)).rgb * 20.0;
      vec3 behind = 0.5 * uColor;
      vec3 indirect = behind * uColor * 0.96 * diffuseLight + specularLight * 0.04;
      float d = clamp(dot(viewNormal, vec3(0.5773)), 0.0, 1.0);
      vec3 color = behind + reverseAo * d * (0.1 + uColor) + indirect;
      color *= mix(1.0, 0.6, blurAmount);
      color += 0.5 * indirect * smoothstep(0.75, 0.8, d);
      color = clamp(color, 0.0, 1.0);
      float alpha = uOpacity * clamp(specularLight.r, 0.0, 1.0);
    #endif
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), alpha);
  }
`;

// ---------- Wearable intro: the jacket photo the coaster lands on ----------

// Shared by the jacket photo and the headline: how strongly the picture behind the frame is
// smeared at a point. Sharp around the coaster's landing spot, grainy and blurred further out,
// clearing as the photo finishes arriving.
const frameBlur = /* glsl */ `
  float linearstep(float a, float b, float v) { return clamp((v - a) / (b - a), 0.0, 1.0); }
  // dist: distance from the landing spot, in viewport heights. show: 0..1 arrival of the photo.
  float frameBlur(float dist, float show) {
    float b = linearstep(0.15, 0.2 + show * 0.6, dist);
    return b * b * (1.0 - show);
  }
`;

export const jacketFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uShow;
  uniform float uFrameHeight;
  varying vec2 vUv;
  ${frameBlur}
  void main() {
    float dist = length((vUv - vec2(0.5, 0.679)) * vec2(850.0 / 1100.0, 1.0)) * uFrameHeight;
    float blur = frameBlur(dist, uShow);
    float opacity = linearstep(0.0, 0.3, uShow);
    float blend = smoothstep(blur * 0.25, 1.0 + blur * 0.25, opacity * 1.25);
    gl_FragColor = vec4(texture2D(uTexture, vUv).rgb, blend);
  }
`;

// The "it's wearable" headline, drawn from a distance-field texture. Inside the photo frame it
// is sampled through a noisy blur, so it appears to break up into grain as the photo arrives.
export const headlineFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec4 uRect;
  uniform vec4 uFrame;
  uniform vec2 uViewport;
  uniform float uDpr;
  uniform float uShow;
  uniform float uOpacity;
  ${frameBlur}
  const vec2 SCALE_FIX = vec2(0.9913, 0.9001);
  float median(float r, float g, float b) { return max(min(r, g), min(max(r, g), b)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  // x: glyph coverage, y: soft halo around the glyphs.
  vec2 textAt(vec2 px) {
    vec2 uv = (px - uRect.xy) / uRect.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0);
    uv.y = 1.0 - uv.y;
    vec3 msdf = texture2D(uTexture, (uv - 0.5) * SCALE_FIX + 0.5).rgb;
    float sd = median(msdf.r, msdf.g, msdf.b);
    float range = 4.0 * uRect.z / (458.0 * SCALE_FIX.x);
    return vec2(clamp((sd - 0.5) * range + 0.5, 0.0, 1.0), smoothstep(0.05, 0.5, sd));
  }
  void main() {
    vec2 px = vec2(gl_FragCoord.x, uViewport.y * uDpr - gl_FragCoord.y) / uDpr;
    vec2 result = textAt(px);
    bool inFrame = px.x > uFrame.x && px.y > uFrame.y && px.x < uFrame.x + uFrame.z && px.y < uFrame.y + uFrame.w;
    if (inFrame && uShow > 0.0) {
      vec2 centre = uFrame.xy + uFrame.zw * vec2(0.5, 0.321);
      float blur = frameBlur(length(px - centre) / uViewport.y, uShow);
      float radius = blur * linearstep(0.0, 0.3, uShow) * 0.0632 * uViewport.y;
      if (radius > 0.5) {
        // Golden-angle disc of taps, rotated per pixel so the blur resolves as grain.
        float angle = hash(gl_FragCoord.xy) * 6.28318;
        vec2 sum = vec2(0.0);
        for (int i = 0; i < 8; i++) {
          float r = sqrt((float(i) + 0.5) / 8.0) * radius;
          sum += textAt(px + vec2(cos(angle), sin(angle)) * r);
          angle += 2.39996323;
        }
        result = sum / 8.0;
      }
    }
    float alpha = max(result.x, result.y * 0.22) * uOpacity;
    gl_FragColor = vec4(1.0, 0.929, 0.843, alpha);
  }
`;
