/**
 * scale.js — 교육용 압축 스케일.
 *
 * 실제 비율(태양 지름 139만 km, 해왕성 45억 km)은 한 화면에 절대 담을 수 없다.
 * 그래서:
 *   · 행성 크기는 서로의 상대비를 그대로 유지 (지구 반지름 = 1.25 씬 단위)
 *   · 태양만 예외적으로 축소 (실제 비율이면 반지름 137 단위 → 수성 궤도를 삼킴)
 *   · 거리는 a^0.6 로그성 압축 — 안쪽 행성이 뭉치지 않으면서 해왕성도 화면에 들어온다
 *   · **각도(황경)는 압축하지 않는다.** 위에서 내려다본 배치각은 실제 하늘 그대로다.
 */

import { DEG } from './ephemeris.js';

/** 지구 반지름(6371km)을 씬 1.25 단위로 */
export const KM_TO_SCENE = 1.25 / 6371;

/** 태양은 별도 축소 (실제 비율의 약 1/7.6) */
export const SUN_RADIUS = 18;

/** 거리 압축: AU → 씬 반지름 */
export const DIST_BASE = 25;
export const DIST_SCALE = 40;
export const DIST_POWER = 0.6;

export function auToScene(au) {
  if (au <= 0) return 0;
  return DIST_BASE + DIST_SCALE * Math.pow(au, DIST_POWER);
}

/** 씬 반지름 → AU (카메라 거리 표기용 역변환) */
export function sceneToAu(r) {
  if (r <= DIST_BASE) return 0;
  return Math.pow((r - DIST_BASE) / DIST_SCALE, 1 / DIST_POWER);
}

/** 천체 반지름(km) → 씬 반지름 */
export function radiusToScene(km) {
  return km * KM_TO_SCENE;
}

/** 달 궤도: 실제 384,400km 를 6.4 단위로 압축 (변화폭은 실제 비율 유지) */
export const MOON_ORBIT_BASE = 6.4;
export const MOON_ORBIT_REF_KM = 384400;

export function moonDistToScene(km) {
  return MOON_ORBIT_BASE * (km / MOON_ORBIT_REF_KM);
}

/** 소행성대 (실제 2.1 ~ 3.3 AU) */
export const BELT_INNER_AU = 2.06;
export const BELT_OUTER_AU = 3.36;

/**
 * 황도 좌표(황경/황위/거리) → three.js 씬 좌표.
 *
 * 황도 직교계(+Z = 황북극)를 three 의 Y-up 으로 옮긴다:
 *   x =  r·cosβ·cosλ
 *   y =  r·sinβ            (황북극 → +Y)
 *   z = -r·cosβ·sinλ
 * 손잡이(handedness)가 보존되므로 위에서(+Y) 내려다본 배치각이 실제와 일치한다.
 */
export function eclipticToScene(lonDeg, latDeg, r, target) {
  const cl = Math.cos(latDeg * DEG);
  target.set(
    r * cl * Math.cos(lonDeg * DEG),
    r * Math.sin(latDeg * DEG),
    -r * cl * Math.sin(lonDeg * DEG)
  );
  return target;
}

/** 카메라 클리핑 */
export const CAMERA_NEAR = 0.02;
export const CAMERA_FAR = 24000;

/** 전체 보기 기본 카메라 위치 */
export const OVERVIEW_POSITION = [0, 235, 405];
