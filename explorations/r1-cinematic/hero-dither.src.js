/* ===========================================================================
   The hero background, as the supplied snippet specifies it.

   SOURCE FILE. hero-dither.js next to it is the build output — regenerate with:

     ./node_modules/.bin/esbuild explorations/r1-cinematic/hero-dither.src.js \
       --bundle --format=iife --target=es2018 --minify \
       --outfile=explorations/r1-cinematic/hero-dither.js


   The snippet is React (`<Dithering>` from @paper-design/shaders-react). This
   page is not React, so this mounts the identical shader through the vanilla
   core of the same package — same fragment shader, same uniforms, same
   defaults. Nothing here is a reinterpretation:

     colorBack     "#00000000"                 transparent
     colorFront    "#EC4E02"                   accent
     shape         "warp"                      DitheringShapes.warp  = 2
     type          "4x4"                       DitheringTypes['4x4'] = 3
     speed         0.2, and 0.6 while hovered
     minPixelRatio 1

   The wrapper's compositing comes across too: the snippet renders the layer at
   `dark:opacity-30` with `dark:mix-blend-screen`, which is the branch this
   page is always in.
   =========================================================================== */
import {
  ShaderMount,
  ditheringFragmentShader,
  getShaderColorFromString,
  ShaderFitOptions,
  defaultPatternSizing,
  DitheringShapes,
  DitheringTypes,
} from '@paper-design/shaders';

(function () {
  var host = document.querySelector('[data-dither]');
  if (!host) return;

  var uniforms = {
    u_colorBack: getShaderColorFromString('#00000000'),
    u_colorFront: getShaderColorFromString('#EC4E02'),
    u_shape: DitheringShapes.warp,
    u_type: DitheringTypes['4x4'],
    u_pxSize: 2,
    /* the React component's own sizing defaults, unaltered */
    u_fit: ShaderFitOptions[defaultPatternSizing.fit],
    u_scale: defaultPatternSizing.scale,
    u_rotation: defaultPatternSizing.rotation,
    u_offsetX: defaultPatternSizing.offsetX,
    u_offsetY: defaultPatternSizing.offsetY,
    u_originX: defaultPatternSizing.originX,
    u_originY: defaultPatternSizing.originY,
    u_worldWidth: defaultPatternSizing.worldWidth,
    u_worldHeight: defaultPatternSizing.worldHeight,
  };

  var IDLE = 0.2, HOVER = 0.6;
  var reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;

  var mount;
  try {
    mount = new ShaderMount(
      host, ditheringFragmentShader, uniforms,
      undefined,          /* webgl context attributes */
      reduced ? 0 : IDLE, /* speed — 0 renders one frame and stops the rAF */
      0,                  /* frame */
      1                   /* minPixelRatio, per the snippet */
    );
  } catch (e) {
    return; /* no WebGL: the hero keeps its scrim and type, and loses only the pattern */
  }

  if (reduced) return;

  /* the snippet raises the speed while the pointer is over the panel; here the
     panel is the hero, so the hero is what you hover */
  var target = document.querySelector('[data-dither-hover]') || host;
  target.addEventListener('pointerenter', function () { mount.setSpeed(HOVER); });
  target.addEventListener('pointerleave', function () { mount.setSpeed(IDLE); });
})();
