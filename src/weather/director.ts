import * as THREE from 'three';
import type { Store, WeatherKind, WeatherState } from '../core/store';
import { QUALITY, SPEED, WEATHER_FX } from '../core/constants';
import type { Stage } from '../scene/stage';
import type { LightingRig } from '../scene/lighting';
import type { RoadRig } from '../scene/world/road';
import type { SceneryRig } from '../scene/world/scenery';
import type { Car } from '../scene/car/car';
import { damp } from '../util/math';
import { createRain } from './effects/rain';
import { createSnow } from './effects/snow';
import { createSplash } from './effects/splash';
import { createGlass } from './effects/glass';
import { createLightning } from './effects/lightning';

/**
 * Turns a WeatherState into what you see. Owns the effect modules, cross-fades every
 * intensity and colour over ~3 s so conditions never pop, and drives fog, sky, lighting,
 * road wetness, scenery lamps and the headlight cones.
 */
export interface WeatherLook {
  night: number;
  rain: number;
  snow: number;
  wet: number;
  flash: number;
  coldBoost: number;
  fogDensity: number;
}

export interface WeatherEffect {
  mount(parent: THREE.Object3D): void;
  setIntensity(n: number): void;
  update(dt: number, speed: number): void;
  dispose(): void;
}

export interface DirectorDeps {
  store: Store;
  stage: Stage;
  lighting: LightingRig;
  road: RoadRig;
  scenery: SceneryRig;
  car: Car;
}

export interface WeatherDirector {
  update(dt: number, speed: number, engine: number): WeatherLook;
  onThunder(cb: (strength: number) => void): () => void;
  /** Force a lightning strike (debugging). */
  strike(): void;
  dispose(): void;
}

interface Targets {
  kind: WeatherKind;
  night: number;
  rain: number;
  snow: number;
  condense: number;
  fog: number;
  lightning: number;
  coldBoost: number;
}

function targetsFor(weather: WeatherState | null, status: string): Targets {
  if (!weather) {
    if (status === 'error') {
      return { kind: 'clear', night: WEATHER_FX.EVENING_NIGHT, rain: 0, snow: 0, condense: 0, fog: WEATHER_FX.FOG.clear, lightning: 0, coldBoost: 1 };
    }
    return { kind: 'overcast', night: 0, rain: 0, snow: 0, condense: 0, fog: WEATHER_FX.FOG.overcast, lightning: 0, coldBoost: 1 };
  }
  const k = weather.kind;
  const I = WEATHER_FX.INTENSITY;
  const rain = k === 'drizzle' ? I.drizzle : k === 'rain' ? I.rain : k === 'heavyRain' ? I.heavyRain : k === 'thunder' ? I.thunder : 0;
  const snow = k === 'snow' ? I.snow : 0;
  const t = weather.temperatureC;
  const G = WEATHER_FX.GLASS;
  const condenseCold = THREE.MathUtils.clamp((G.condenseBelowC - t) / (G.condenseBelowC - G.condenseFullC), 0, 1);
  const condense = Math.max(condenseCold, rain * 0.6, snow * 0.5);
  const C = WEATHER_FX.COLD_BOOST;
  const coldBoost = t < C.coldC ? C.cold : t < C.coolC ? C.cool : 1;
  return { kind: k, night: weather.isDay ? 0 : 1, rain, snow, condense, fog: WEATHER_FX.FOG[k], lightning: k === 'thunder' ? 1 : 0, coldBoost };
}

export function createWeatherDirector(deps: DirectorDeps): WeatherDirector {
  const { store, stage, lighting, road, scenery, car } = deps;
  const quality = store.get().quality;
  const rain = createRain(quality);
  const snow = createSnow(quality);
  const splash = createSplash(car.wheels.wheels.map((w) => new THREE.Vector3(w.x, 0, w.z)));
  const glass = createGlass(car.body.panes);
  const lightning = createLightning();
  rain.mount(stage.weatherRoot);
  snow.mount(stage.weatherRoot);
  splash.mount(stage.weatherRoot);
  glass.mount(stage.bodyRig);
  snow.mountCaps(stage.slab);

  // Smoothed state.
  const cur: Record<'night' | 'rain' | 'snow' | 'condense' | 'fog' | 'lightning' | 'coldBoost' | 'wet', number> = {
    night: 0,
    rain: 0,
    snow: 0,
    condense: 0,
    fog: WEATHER_FX.FOG.overcast,
    lightning: 0,
    coldBoost: 1,
    wet: 0,
  };
  const colTop = new THREE.Color(WEATHER_FX.LOOKS.overcast.top);
  const colBottom = new THREE.Color(WEATHER_FX.LOOKS.overcast.bottom);
  const keyColor = new THREE.Color(WEATHER_FX.LOOKS.overcast.key);
  const hemiSky = new THREE.Color(WEATHER_FX.LOOKS.overcast.hemiSky);
  const hemiGround = new THREE.Color(WEATHER_FX.LOOKS.overcast.hemiGround);
  let keyI: number = WEATHER_FX.LOOKS.overcast.keyI;
  let hemiI: number = WEATHER_FX.LOOKS.overcast.hemiI;

  // Scratch.
  const tTop = new THREE.Color();
  const tBottom = new THREE.Color();
  const tKey = new THREE.Color();
  const tHemiSky = new THREE.Color();
  const tHemiGround = new THREE.Color();
  const nightTop = new THREE.Color(WEATHER_FX.NIGHT.top);
  const nightBottom = new THREE.Color(WEATHER_FX.NIGHT.bottom);
  const nightKey = new THREE.Color(WEATHER_FX.NIGHT.key);
  const nightHemiSky = new THREE.Color(WEATHER_FX.NIGHT.hemiSky);
  const nightHemiGround = new THREE.Color(WEATHER_FX.NIGHT.hemiGround);
  const heads: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  const drift = new THREE.Vector2();

  let targets = targetsFor(store.get().weather, store.get().weatherStatus);
  const recompute = () => {
    targets = targetsFor(store.get().weather, store.get().weatherStatus);
  };
  const unsubs = [store.subscribe('weather', recompute), store.subscribe('weatherStatus', recompute)];
  const look: WeatherLook = { night: 0, rain: 0, snow: 0, wet: 0, flash: 0, coldBoost: 1, fogDensity: cur.fog };

  return {
    update(dt, speed, engine) {
      const L = WEATHER_FX.CROSSFADE_LAMBDA;
      cur.rain = damp(cur.rain, targets.rain, L, dt);
      cur.snow = damp(cur.snow, targets.snow, L, dt);
      cur.condense = damp(cur.condense, targets.condense, L, dt);
      cur.fog = damp(cur.fog, targets.fog, L, dt);
      cur.lightning = damp(cur.lightning, targets.lightning, L * 2, dt);
      cur.coldBoost = damp(cur.coldBoost, targets.coldBoost, L, dt);
      cur.night = damp(cur.night, targets.night, WEATHER_FX.NIGHT_LAMBDA, dt);
      // The road stays wet a while after rain stops.
      cur.wet = damp(cur.wet, Math.min(1, targets.rain * 1.3), targets.rain > cur.wet ? L : 0.25, dt);

      // Colours: kind's day look, pulled toward night.
      const day = WEATHER_FX.LOOKS[targets.kind];
      tTop.set(day.top).lerp(nightTop, cur.night);
      tBottom.set(day.bottom).lerp(nightBottom, cur.night);
      tKey.set(day.key).lerp(nightKey, cur.night);
      tHemiSky.set(day.hemiSky).lerp(nightHemiSky, cur.night);
      tHemiGround.set(day.hemiGround).lerp(nightHemiGround, cur.night);
      const k = 1 - Math.exp(-L * dt);
      colTop.lerp(tTop, k);
      colBottom.lerp(tBottom, k);
      keyColor.lerp(tKey, k);
      hemiSky.lerp(tHemiSky, k);
      hemiGround.lerp(tHemiGround, k);
      keyI = damp(keyI, THREE.MathUtils.lerp(day.keyI, WEATHER_FX.NIGHT.keyI, cur.night), L, dt);
      hemiI = damp(hemiI, THREE.MathUtils.lerp(day.hemiI, WEATHER_FX.NIGHT.hemiI, cur.night), L, dt);

      // Lightning: a flash brightens everything for a couple of frames.
      lightning.setIntensity(cur.lightning);
      const flash = lightning.update(dt);

      stage.sky.setColors(colTop, colBottom);
      stage.sky.setFlash(flash);
      stage.setFog(stage.sky.fogColor, cur.fog);
      // Sun / moon disc: warm low sun by day on clear/cloudy skies, a pale moon at night.
      const discDay = targets.kind === 'clear' ? 0.9 : targets.kind === 'cloudy' ? 0.4 : 0;
      stage.sky.setDisc(0.62, 0.66, 0.05, cur.night > 0.5 ? '#E8EEF5' : '#FFE9B8', Math.max(discDay * (1 - cur.night), cur.night * (targets.kind === 'clear' || targets.kind === 'cloudy' ? 0.7 : 0)));

      lighting.setLook({ keyColor, keyIntensity: keyI, hemiSky, hemiGround, hemiIntensity: hemiI, night: cur.night, flash });
      lighting.setHeadlights(cur.night * engine);
      const n = scenery.streetlightHeads(heads);
      lighting.updateStreetlights(heads, n, cur.night);
      scenery.setNight(cur.night);
      road.setWetness(cur.wet);

      const qs = store.get().quality === 'low' ? QUALITY.PRECIP_SCALE_LOW : 1;
      rain.setIntensity(cur.rain * qs);
      snow.setIntensity(cur.snow * qs);
      splash.setIntensity(cur.rain * qs);
      glass.setIntensity(Math.max(cur.rain, cur.snow * 0.4));
      glass.setCondensation(cur.condense);
      const sk = Math.min(1, speed / SPEED.FOCUS);
      drift.set(-0.28 * sk, -0.06 + 0.2 * sk);
      glass.setDrift(drift);

      rain.update(dt, speed);
      snow.update(dt, speed);
      splash.update(dt, speed);
      glass.update(dt, speed);

      look.night = cur.night;
      look.rain = cur.rain;
      look.snow = cur.snow;
      look.wet = cur.wet;
      look.flash = flash;
      look.coldBoost = cur.coldBoost;
      look.fogDensity = cur.fog;
      return look;
    },
    onThunder: (cb) => lightning.onThunder(cb),
    strike: () => lightning.strike(),
    dispose() {
      for (const u of unsubs) u();
      rain.dispose();
      snow.dispose();
      splash.dispose();
      glass.dispose();
    },
  };
}
