function avatarSphere() {
  const vertices = [];
  const rings = 8;
  const sides = 12;
  function point(ring, side) {
    const latitude = Math.PI * ring / rings;
    const longitude = 2 * Math.PI * side / sides;
    return [Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)];
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = point(ring, side);
      const b = point(ring + 1, side);
      const c = point(ring + 1, side + 1);
      const d = point(ring, side + 1);
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return new Float32Array(vertices);
}

function avatarResources(gl) {
  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      throw new Error('Unable to draw the walking figure. ' + gl.getShaderInfoLog(result));
    }
    return result;
  }

  const vertex = shader(gl.VERTEX_SHADER, `
    attribute vec3 aVertex;
    uniform mat4 uProjection;
    uniform vec3 uCenter;
    uniform vec3 uRadius;
    uniform vec2 uTilt;
    varying mediump float vLight;
    vec3 rotateX(vec3 p) {
      return vec3(p.x, uTilt.x * p.y - uTilt.y * p.z, uTilt.y * p.y + uTilt.x * p.z);
    }
    void main() {
      gl_Position = uProjection * vec4(uCenter + rotateX(aVertex * uRadius), 1.0);
      vec3 normal = normalize(rotateX(aVertex / uRadius));
      vLight = 0.66 + 0.34 * max(dot(normal, normalize(vec3(-0.5, 0.85, -0.55))), 0.0);
    }
  `);
  const fragment = shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec4 uColor;
    varying mediump float vLight;
    void main() {
      gl_FragColor = vec4(uColor.rgb * vLight * uColor.a, uColor.a);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Unable to draw the walking figure. ' + gl.getProgramInfoLog(program));
  }

  const vertices = avatarSphere();
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const uniforms = Object.fromEntries(['Projection', 'Center', 'Radius', 'Tilt', 'Color'].map(name =>
    [name, gl.getUniformLocation(program, 'u' + name)]
  ));
  return { program, buffer, vertex: gl.getAttribLocation(program, 'aVertex'), uniforms, count: vertices.length / 3 };
}

function projectAvatar(matrix, location, bearing) {
  const angle = bearing * Math.PI / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const scale = location.meterInMercatorCoordinateUnits();
  const result = new Float32Array(16);
  // Compose the local metre axes and Mercator origin before rounding to GPU precision.
  for (let row = 0; row < 4; row++) {
    const east = matrix[row];
    const south = matrix[4 + row];
    const up = matrix[8 + row];
    result[row] = (east * cos + south * sin) * scale;
    result[4 + row] = up * scale;
    result[8 + row] = (east * sin - south * cos) * scale;
    result[12 + row] = east * location.x + south * location.y + up * location.z + matrix[12 + row];
  }
  return result;
}

function createWalkAvatar(map, beforeLayer) {
  const shirt = [0.12, 0.55, 0.47];
  const pants = [0.18, 0.25, 0.31];
  const skin = [0.84, 0.59, 0.43];
  const hair = [0.27, 0.18, 0.14];
  const shoes = [0.21, 0.22, 0.22];
  let pose, resources;
  function forgetResources() { resources = undefined; }

  map.addLayer({
    id: 'patria-walker',
    type: 'custom',
    renderingMode: '3d',
    onAdd() { map.on('webglcontextlost', forgetResources); },
    onRemove(_map, gl) {
      map.off('webglcontextlost', forgetResources);
      if (!resources) return;
      gl.deleteBuffer(resources.buffer);
      gl.deleteProgram(resources.program);
      forgetResources();
    },
    render(gl, { defaultProjectionData }) {
      if (!pose) return;
      resources ??= avatarResources(gl);
      const { program, buffer, vertex, uniforms, count } = resources;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(vertex);
      gl.vertexAttribPointer(vertex, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(uniforms.Projection, false, projectAvatar(defaultProjectionData.mainMatrix, pose.location, pose.bearing));

      function piece(center, radius, color, tilt = 0, opacity = 1) {
        gl.uniform3fv(uniforms.Center, center);
        gl.uniform3fv(uniforms.Radius, radius);
        gl.uniform2f(uniforms.Tilt, Math.cos(tilt), Math.sin(tilt));
        gl.uniform4f(uniforms.Color, ...color, opacity);
        gl.drawArrays(gl.TRIANGLES, 0, count);
      }

      const bob = pose.moving ? 0.028 * Math.sin(pose.phase * 2) : 0;
      piece([-0.11, 0.019, -0.19], [0.34, 0.012, 0.5], [0.16, 0.22, 0.2], 0, 0.24);
      piece([0, 0.81 + bob, 0], [0.18, 0.15, 0.13], pants);
      piece([0, 1.12 + bob, 0], [0.23, 0.34, 0.145], shirt);
      piece([0, 1.53 + bob, 0.018], [0.121, 0.143, 0.121], skin);
      piece([0, 1.59 + bob, -0.015], [0.122, 0.103, 0.116], hair);

      for (const side of [-1, 1]) {
        const cycle = pose.phase + (side < 0 ? Math.PI : 0);
        const stride = pose.moving ? Math.sin(cycle) : 0;
        const lift = pose.moving ? Math.max(0, Math.cos(cycle)) * 0.15 : 0;
        const hip = 0.8 + bob;
        const ankle = 0.103 + lift;
        const foot = stride * 0.285;
        const legTilt = -Math.atan2(foot, hip - ankle);
        piece([side * 0.102, (hip + ankle) / 2, foot / 2],
          [0.093, Math.hypot(hip - ankle, foot) / 2 + 0.04, 0.092], pants, legTilt);
        piece([side * 0.102, ankle - 0.038, foot + 0.047], [0.085, 0.061, 0.145], shoes);

        const swing = stride * 0.58;
        const shoulder = 1.32 + bob;
        piece([side * 0.222, shoulder - 0.206 * Math.cos(swing), -0.206 * Math.sin(swing)],
          [0.072, 0.232, 0.073], shirt, swing);
        piece([side * 0.222, shoulder - 0.434 * Math.cos(swing), -0.434 * Math.sin(swing)],
          [0.054, 0.063, 0.054], skin, swing);
      }
      gl.disableVertexAttribArray(vertex);
    },
  }, beforeLayer);

  return {
    move(location, bearing, phase, moving) {
      pose = { location, bearing, phase, moving };
      map.triggerRepaint();
    },
    clear() {
      if (!pose) return;
      pose = undefined;
      map.triggerRepaint();
    },
  };
}
