// お題（ジャンル × ひねり × テーマ）をランダムに組み合わせる（日英併記）
// どのAIにも同じ仕組みでお題を出すことで、AI同士の比較をしやすくする。
import { listGameIds, readJson, GAMES_DIR } from './lib.mjs';
import path from 'node:path';

export const GENRES = {
  アクション: 'Action', シューティング: 'Shooter', パズル: 'Puzzle', レース: 'Racing', リズム: 'Rhythm',
  スポーツ: 'Sports', ストラテジー: 'Strategy', アドベンチャー: 'Adventure', その他: 'Other',
};

const MECHANICS = [
  ['アクション', '落ちてくる障害物を避け続ける', 'keep dodging falling obstacles'],
  ['アクション', '重力を反転させながら進むランナー', 'a runner where you flip gravity'],
  ['アクション', 'ワンボタンでジャンプするエンドレスラン', 'a one-button endless runner'],
  ['アクション', 'フックを引っ掛けて振り子移動する', 'swing around with a grappling hook'],
  ['シューティング', '弾幕を避けながら敵を撃つ縦スクロール', 'a vertical shooter dodging bullet patterns'],
  ['シューティング', '360度から迫る敵を中央の砲台で撃つ', 'defend a central turret from enemies on all sides'],
  ['シューティング', '跳ね返る弾で敵を倒す', 'defeat enemies with ricocheting shots'],
  ['パズル', '同じ色を3つ以上つなげて消す', 'match three or more of the same color'],
  ['パズル', 'ブロックを押して道を作る倉庫番風', 'a Sokoban-like where you push blocks to make a path'],
  ['パズル', '光を鏡で反射させてゴールに届ける', 'reflect light with mirrors to reach the goal'],
  ['パズル', '数字を合体させて大きくする', 'merge numbers to make bigger ones'],
  ['レース', '左右に車線変更して前の車を抜いていく', 'change lanes to overtake cars ahead'],
  ['レース', 'カーブでドリフトして距離を稼ぐ', 'drift through corners to go as far as possible'],
  ['リズム', 'タイミングよくボタンを押して音に合わせる', 'press in time with the beat'],
  ['スポーツ', 'ボールを打ち返し続ける', 'keep hitting the ball back'],
  ['スポーツ', 'ゴールに向かってボールを弾く', 'flick a ball into the goal'],
  ['ストラテジー', '限られた資源でタワーを置いて防衛する', 'place towers with limited resources to defend'],
  ['ストラテジー', '陣地を塗り広げる', 'paint and expand your territory'],
  ['アドベンチャー', '迷路を探索して鍵を集める', 'explore a maze and collect keys'],
  ['その他', '物を積み上げて高さを競う', 'stack objects as high as possible'],
  ['その他', '釣り糸を垂らしてタイミングよく釣り上げる', 'drop a fishing line and reel in with good timing'],
  ['その他', '惑星の軌道を回りながら星を集める', 'orbit planets while collecting stars'],
];
const TWISTS = [
  ['時間がたつほど画面が狭くなる', 'the play area shrinks over time'],
  ['操作が数秒ごとに左右反転する', 'left/right controls flip every few seconds'],
  ['敵を倒すと自分が大きくなる', 'you grow bigger when you defeat enemies'],
  ['一筆書きの軌跡が武器になる', 'your continuous trail becomes a weapon'],
  ['光の届く範囲しか見えない', 'you can only see what your light reaches'],
  ['スコアが燃料を兼ねている', 'your score doubles as fuel'],
  ['コンボが続くほど速度が上がる', 'speed increases as your combo grows'],
  ['2つのキャラを同時に操作する', 'you control two characters at once'],
  ['ミスすると世界の色が変わる', 'the world changes color when you make a mistake'],
  ['音（効果音）が重要な手がかりになる', 'sound effects are an important clue'],
  ['風や重力の向きが変化する', 'wind or gravity direction changes'],
  ['すべてが円形のフィールドで起こる', 'everything happens on a circular field'],
  ['止まっている間だけ時間が進む', 'time only moves while you stand still'],
  ['アイテムを取ると能力がランダムに変わる', 'items randomly change your abilities'],
  ['ひねりなし（王道を丁寧に作る）', 'no twist (a polished classic)'],
];
const THEMES = [
  ['深海', 'deep sea'], ['宇宙', 'outer space'], ['ネオン都市', 'neon city'], ['和風（夜祭り）', 'Japanese night festival'],
  ['お菓子の国', 'candy land'], ['雪山', 'snowy mountains'], ['古代遺跡', 'ancient ruins'], ['ミクロの細胞世界', 'microscopic cell world'],
  ['レトロゲーム風ドット', 'retro pixel art'], ['ジャングル', 'jungle'], ['雲の上', 'above the clouds'], ['工場', 'factory'],
  ['月夜の森', 'moonlit forest'], ['サイバー空間', 'cyberspace'], ['砂漠のオアシス', 'desert oasis'], ['水彩画風', 'watercolor painting'],
];

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

export function recentTitles(limit = 30) {
  return listGameIds().slice(-limit).map((id) => readJson(path.join(GAMES_DIR, id, 'meta.json'))?.title).filter(Boolean);
}

export function makeIdea(rnd = Math.random) {
  const [genre, mechanic, mechanicEn] = pick(MECHANICS, rnd);
  const [twist, twistEn] = pick(TWISTS, rnd);
  const [theme, themeEn] = pick(THEMES, rnd);
  return {
    genre, mechanic, twist, theme,
    text: `ジャンル「${genre}」: ${mechanic}ゲーム。ひねり: ${twist}。テーマ/見た目: ${theme}。`,
    textEn: `Genre "${GENRES[genre]}": ${mechanicEn}. Twist: ${twistEn}. Theme/look: ${themeEn}.`,
  };
}
