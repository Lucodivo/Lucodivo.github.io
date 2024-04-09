import { squareBuffers } from "./buffers.js"
import { drawScene } from "./draw_scene.js"

main();

window.onresize = function(){ 
  location.reload()
}

function main() {
  const canvas = document.querySelector("#glcanvas");
  // Make it visually fill the positioned parent
  canvas.style.width ='100%';
  canvas.style.height='100%';
  // ...then set the internal size to match
  canvas.width  = canvas.offsetWidth / 2;
  canvas.height = canvas.offsetHeight / 2;

  const gl = canvas.getContext("webgl");

  if (gl === null) {
    alert( "Unable to initialize WebGL. Your browser or machine may not support it.");
    return;
  }
  const vsSource = `
  attribute vec4 aVertexPosition;
  void main() {
    gl_Position = aVertexPosition;
  }
  `;

  const fsSource = `
  precision highp float;

  #define MAX_STEPS 50
  #define MISS_DIST 60.0
  #define HIT_DIST 0.01

  const float pi = 3.14159265;
  const float tau = pi * 2.0;

  uniform vec2 uViewportResolution;
  uniform float uTime;
  uniform float uVelocity;

  vec2 distanceRayToScene(vec3 rayOrigin, vec3 rayDir);
  float sdCross(vec3 rayPos, vec3 dimen);
  float sdRect(vec2 rayPos, vec2 dimen);
  float sdMengerPrison(vec3 rayPos);

  const float boxDimen = 20.0;
  const float halfBoxDimen = boxDimen * 0.5;

  const int iterations = 5;
  const vec3 rayOrigin = vec3(0.0, 0.0, -boxDimen);
  const vec3 forward = vec3(0.0, 0.0, 1.0);

  const float velocityUnit = boxDimen; // velocity in terms of length of the largest menger cube

  // x % y
  int mod(int x, int y){ return x - (y * (x / y)); }

  // x % y
  float modf(float x, float y){ return x - (y * floor(x / y)); }

  // Array index expressions must be constant, so function??
    float highYLevel(int i) {
      float result = 0.0;
      if(i == 0) {
        result = 1.0;
      } else if(i == 1) {
        result = 0.5 + (3.0 / 18.0);
      } else if(i == 2) {
        result = 0.5 + (3.0 / 54.0);
      } else if(i == 3) {
        result = 0.5 + (3.0 / 162.0);
      }
      return result;
    }

  vec2 upRightLeftDownVecs(int i) {
    vec2 result = vec2(0.0, 0.0);
    if(i == 0) {
      result.y = -1.0;
    } else if(i == 1){
      result.x = -1.0;
    } else if(i == 2){
      result.x = 1.0;
    } else if(i == 3){
      result.y = 1.0;
    }
    return result;
  }

  void main()
  {
    // Move (0,0) from bottom left to center
    vec2 pixelCoord = gl_FragCoord.xy-0.5*uViewportResolution.xy;
    // Scale y value to [-1.0, 1.0], scale x by same factor
    pixelCoord = pixelCoord / uViewportResolution.y;

    float secondsPerCycle = 4.0 / uVelocity;
    float cyclesPerSecond = 1.0 / secondsPerCycle;

    vec3 rayDir = vec3(pixelCoord.x, pixelCoord.y, 1.0);
    mat3 cameraRotationMat = mat3(1.0); // identity
    rayDir = normalize(cameraRotationMat * rayDir);

    float cycle = uTime * cyclesPerSecond;
    int cycleTrunc = int(cycle);
    float cosY = -cos(tau * cycle); // cycl
    float smoothY = smoothstep(-0.60, 0.60, cosY);
    int movementIndex = mod(cycleTrunc, 4);
    float highLevelY = highYLevel(movementIndex);
    float offset1d = smoothY * boxDimen * highLevelY;
    float time = modf(uTime, 1.0);
    vec3 offset3d = vec3(offset1d * upRightLeftDownVecs(movementIndex), uTime * uVelocity * velocityUnit);
    vec3 rayPos = rayOrigin + offset3d;

    vec2 dist = distanceRayToScene(rayPos, rayDir);

    if(dist.x > 0.0) { // hit
      vec3 col = vec3(1.0 - (dist.y / float(MAX_STEPS)));
      gl_FragColor = vec4(col, 1.0);
    } else { // miss
      vec3 missColor = vec3(0.2, 0.2, 0.2);
      gl_FragColor = vec4(missColor, 1.0);
    }
  }

  // returns vec2(dist, iterations)
  // NOTE: ray dir is assumed to be normalized
  vec2 distanceRayToScene(vec3 rayOrigin, vec3 rayDir) {

    float dist = 0.0;

    for(int i = 0; i < MAX_STEPS; i++) {
      vec3 pos = rayOrigin + (dist * rayDir);
      float posToScene = sdMengerPrison(pos);
      dist += posToScene;
      if(posToScene < HIT_DIST) return vec2(dist, i); // absolute value for posToScene incase the ray makes its way inside an object
      if(posToScene > MISS_DIST) break;
    }

    return vec2(-1.0, MAX_STEPS);
  }

  float sdMengerPrison(vec3 rayPos) {
    vec3 prisonRay = mod(rayPos, boxDimen * 2.0);
    prisonRay -= boxDimen; // move container origin to center
    float mengerPrisonDist = sdCross(prisonRay, vec3(halfBoxDimen));
    if(mengerPrisonDist > HIT_DIST) return mengerPrisonDist; // use dist of biggest crosses as bounding volume

    float scale = 1.0;
    for(int i = 0; i < iterations; ++i) {
      float boxedWorldDimen = boxDimen / scale;
      vec3 ray = mod(rayPos + boxedWorldDimen * 0.5, boxedWorldDimen);
      ray -= boxedWorldDimen * 0.5;
      ray *= scale;
      float crossesDist = sdCross(ray * 3.0, vec3(halfBoxDimen));
      scale *= 3.0;
      crossesDist /= scale;
      mengerPrisonDist = max(mengerPrisonDist, -crossesDist);
    }

    return mengerPrisonDist;
  }

  float sdRect(vec2 rayPos, vec2 dimen) {
    vec2 rayToCorner = abs(rayPos) - dimen;
    float maxDelta = min(max(rayToCorner.x, rayToCorner.y), 0.0);
    return length(max(rayToCorner, 0.0)) + maxDelta;
  }

  float sdCross(vec3 rayPos, vec3 dimen) {
    float distA = sdRect(rayPos.xy, dimen.xy);
    float distB = sdRect(rayPos.xz, dimen.xz);
    float distC = sdRect(rayPos.yz, dimen.yz);
    return min(distA,min(distB,distC));
  }
  `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
    },
    uniformLocations: {
      viewportResolution : gl.getUniformLocation( shaderProgram, "uViewportResolution"),
      time : gl.getUniformLocation( shaderProgram, "uTime"),
      velocity : gl.getUniformLocation( shaderProgram, "uVelocity"),
    },
  }
  const buffer = squareBuffers(gl);
  var frameInput = {
    viewportResolution: gl.getParameter(gl.VIEWPORT).slice(2,5),
    time: 0.0,
    velocity: 0.5,
  }

  let then = 0;
  function render(now) {
    now *= 0.001;
    let deltaTime = now - then;
    then = now;

    frameInput.time = now * frameInput.velocity;
    drawScene(gl, programInfo, buffer, frameInput);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(
      `Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`
    );
    return null;
  }

  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object
  gl.shaderSource(shader, source);

  // Compile the shader program
  gl.compileShader(shader);

  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(
      `An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
