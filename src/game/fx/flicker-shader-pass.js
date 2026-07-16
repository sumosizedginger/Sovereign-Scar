// Beat 13 GUMOI flicker — custom ShaderPass (must insert before outputPass).

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { getSetting } from '../../engine/settings.js';

export const FlickerShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        amount: { value: 0.0 },
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
        uniform float time;
        uniform float amount;
        varying vec2 vUv;
        void main() {
            vec2 uv = vUv;
            float f = sin(time * 37.0 + uv.y * 40.0) * sin(time * 19.0);
            uv.x += f * 0.004 * amount;
            vec4 c = texture2D(tDiffuse, uv);
            float flash = step(0.97, fract(sin(time * 9.1) * 43758.5453)) * amount;
            c.rgb += flash * 0.15;
            c.rgb *= 1.0 - amount * 0.08 * abs(f);
            gl_FragColor = c;
        }
    `,
};

export function createFlickerPass() {
    const pass = new ShaderPass(FlickerShader);
    pass.enabled = false;
    return pass;
}

export function updateFlickerPass(pass, dt, intensity = 0.6) {
    if (!pass) return;
    if (getSetting('reduceFlashing') || getSetting('reduceMotion')) {
        pass.enabled = false;
        return;
    }
    pass.uniforms.time.value += dt;
    pass.uniforms.amount.value = intensity;
    pass.enabled = intensity > 0.01;
}
