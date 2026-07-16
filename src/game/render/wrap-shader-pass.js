// Beat 14 Leviathan — visual screen wrap (independent of gravity swap, D3).

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { getSetting } from '../../engine/settings.js';

export const WrapShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.0 },
        time: { value: 0 },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float time;
        varying vec2 vUv;
        void main() {
            vec2 uv = vUv;
            // Toroidal-ish offset toward edges
            float edge = smoothstep(0.35, 0.5, abs(uv.x - 0.5)) +
                         smoothstep(0.35, 0.5, abs(uv.y - 0.5));
            uv.x = fract(uv.x + sin(uv.y * 6.283 + time) * 0.02 * amount * edge);
            uv.y = fract(uv.y + cos(uv.x * 6.283 + time * 0.7) * 0.015 * amount * edge);
            vec4 c = texture2D(tDiffuse, uv);
            c.rgb = mix(c.rgb, c.rgb.bgr, amount * 0.25 * edge);
            gl_FragColor = c;
        }
    `,
};

export function createWrapPass() {
    const pass = new ShaderPass(WrapShader);
    pass.enabled = false;
    return pass;
}

export function updateWrapPass(pass, dt, amount = 0) {
    if (!pass) return;
    if (getSetting('reduceMotion')) {
        pass.enabled = false;
        return;
    }
    pass.uniforms.time.value += dt;
    pass.uniforms.amount.value = amount;
    pass.enabled = amount > 0.01;
}
