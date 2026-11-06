function trafficMesh() {
  const vertices = [];
  const models = {};
  const metal = [0.33, 0.36, 0.37];
  const glass = [0.22, 0.32, 0.36];
  const cream = [0.83, 0.78, 0.65];
  const black = [0.15, 0.16, 0.17];
  const red = [0.56, 0.14, 0.1];
  const paint = [1, 1, 1];
  const faceVertices = [
    [[0, 3, 2, 1], .63], [[4, 5, 6, 7], .91], [[0, 4, 7, 3], .69],
    [[1, 2, 6, 5], .82], [[3, 7, 6, 2], 1], [[0, 1, 5, 4], .55],
  ];

  function triangle(a, b, c, color, tint = 0, alpha = 1) {
    for (const corner of [a, b, c]) vertices.push(...corner, ...color, tint, alpha);
  }

  function box(x, y, z, width, height, length, color, tint = 0) {
    const left = x - width / 2, right = x + width / 2;
    const bottom = y - height / 2, top = y + height / 2;
    const back = z - length / 2, front = z + length / 2;
    const corners = [
      [left, bottom, back], [right, bottom, back], [right, top, back], [left, top, back],
      [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front],
    ];
    for (const [[a, b, c, d], brightness] of faceVertices) {
      const shade = color.map(channel => channel * brightness);
      triangle(corners[a], corners[b], corners[c], shade, tint);
      triangle(corners[a], corners[c], corners[d], shade, tint);
    }
  }

  function addModel(name, build) {
    const start = vertices.length / 8;
    build();
    models[name] = { start, count: vertices.length / 8 - start };
  }

  addModel('car', () => {
    for (const side of [-1, 1]) {
      for (const axle of [-1.38, 1.38]) box(side * .77, .28, axle, .28, .46, .55, black);
      box(side * .61, .58, 2.15, .35, .17, .05, cream);
      box(side * .64, .57, -2.15, .27, .14, .05, red);
    }
    box(0, .54, 0, 1.77, .64, 4.26, paint, 1);
    box(0, .99, -.28, 1.49, .56, 2.28, glass);
    box(0, 1.3, -.28, 1.53, .12, 2.19, paint, 1);
  });

  addModel('tram', () => {
    box(0, .62, 0, 2.41, 1.05, 14.9, metal);
    box(0, 1.39, 0, 2.58, 1.13, 15.2, red);
    box(0, 2.23, 0, 2.59, .69, 14.98, cream);
    box(0, 2.87, 0, 2.39, .6, 14.8, cream);
    for (const side of [-1, 1]) {
      for (let z = -6.4; z <= 6.4; z += 1.6) box(side * 1.299, 2.28, z, .045, .61, 1.18, glass);
      box(side * .72, .98, 7.62, .33, .26, .05, cream);
    }
    box(0, 2.2, 7.53, 1.77, .65, .06, glass);
  });

  addModel('train', () => {
    box(0, .65, 0, 2.82, 1.21, 17.9, black);
    box(0, 1.85, 0, 3.05, 2.3, 18.55, cream);
    box(0, 3.17, 0, 2.86, .42, 18.27, metal);
    box(0, 1.18, 0, 3.08, .31, 18.55, paint, 1);
    for (const side of [-1, 1]) {
      for (let z = -7.7; z <= 7.7; z += 2.15) box(side * 1.535, 2.31, z, .055, .65, 1.39, glass);
      box(side * .82, 1.31, 9.31, .36, .26, .06, cream);
    }
    box(0, 2.33, 9.28, 2.15, .7, .07, glass);
  });

  addModel('ferry', () => {
    const wake = [0.73, 0.86, 0.89];
    triangle([-2.4, .045, -6.4], [-5.8, .045, -23], [-4.5, .045, -15.7], wake, 0, .2);
    triangle([2.4, .045, -6.4], [5.8, .045, -23], [4.5, .045, -15.7], wake, 0, .2);
    box(0, .68, -.4, 5.1, 1.27, 15.7, paint, 1);
    box(0, 1.34, 0, 4.88, .34, 14.8, cream);
    box(0, 2.13, -.5, 3.69, 1.44, 10.8, cream);
    box(0, 2.35, -.5, 3.75, .7, 10.6, glass);
    box(0, 2.89, -.65, 3.96, .32, 11.1, cream);
    box(0, 3.37, 1.85, .72, 1.03, .66, metal);
  });

  return { models, vertices: new Float32Array(vertices) };
}

function trafficRenderer(gl) {
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const vertex = compile(gl.VERTEX_SHADER, `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    attribute vec2 aMaterial;
    uniform mat4 uProjection;
    uniform vec3 uPaint;
    varying mediump vec4 vColor;
    void main() {
      gl_Position = uProjection * vec4(aPosition, 1.0);
      vColor = vec4(aColor * mix(vec3(1.0), uPaint, aMaterial.x), aMaterial.y);
    }
  `);
  const fragment = compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying mediump vec4 vColor;
    uniform float uOpacity;
    void main() {
      float alpha = vColor.a * uOpacity;
      gl_FragColor = vec4(vColor.rgb * alpha, alpha);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const { models, vertices } = trafficMesh();
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const attributes = [['aPosition', 3, 0], ['aColor', 3, 12], ['aMaterial', 2, 24]]
    .map(([name, size, offset]) => [gl.getAttribLocation(program, name), size, offset]);
  const projection = gl.getUniformLocation(program, 'uProjection');
  const paintColor = gl.getUniformLocation(program, 'uPaint');
  const opacity = gl.getUniformLocation(program, 'uOpacity');

  return {
    begin() {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [index, size, offset] of attributes) {
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, size, gl.FLOAT, false, 32, offset);
      }
    },
    draw(kind, matrix, color, alpha) {
      gl.uniformMatrix4fv(projection, false, matrix);
      gl.uniform3fv(paintColor, color);
      gl.uniform1f(opacity, alpha);
      const { start, count } = models[kind];
      gl.drawArrays(gl.TRIANGLES, start, count);
    },
    end() {
      for (const [index] of attributes) gl.disableVertexAttribArray(index);
    },
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
