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
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
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

    float bumpScale = 1.0 + 0.5 * uHighlight + uExtraBump;
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

    float shadow = calcSoftshadow(vModelPosition, normalize(uLocalLight), 0.00001, 0.08, mix(1.0, 0.5, uHighlight));

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
