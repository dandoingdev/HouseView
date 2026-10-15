// Sky art as data. Everything is original CSS: gradients, radial-gradient clouds, no images, no filters.
// A scene = 3 gradient stops (top, middle, bottom) + up to 6 cloud layers + at most one orb and one effect.
// style.css paints it; this file decides what is in it (the table is docs/overview-api.md).

/**
 * Cloud tones as [lit, shade, highlight]: "r,g,b" of the sunlit top and of the underside, and the strength (0 to 1)
 * of the white highlights on the bumps. The night set is the same four tones lit by the moon: bluer and darker,
 * but still opaque enough to read as cloud.
 */
const TONES = {
  day: {
    w: ['255,255,255', '176,200,236', 0.5],
    l: ['230,238,249', '150,176,212', 0.38],
    g: ['186,198,214', '104,122,150', 0.26],
    d: ['124,138,160', '56,68,92', 0.16]
  },
  night: {
    w: ['126,144,186', '40,56,104', 0.2],
    l: ['108,126,170', '34,48,92', 0.15],
    g: ['90,106,140', '28,40,72', 0.12],
    d: ['70,82,110', '20,28,50', 0.08]
  }
};

// [x% (left), y% (top), width% of the scene, aspect (width / height), opacity, drift seconds (one way),
//  direction (+1 / -1), tone]. Drift is a ping-pong of +-3 % of the scene width.
const CLOUDS = {
  none: [],
  wisps: [
    [-8, 54, 58, 3.4, 0.5, 90, 1, 'w'],
    [50, 66, 56, 3.6, 0.42, 110, -1, 'w']
  ],
  partly: [
    [48, 20, 44, 2.7, 0.97, 120, -1, 'w'],
    [-12, 55, 46, 2.7, 0.95, 90, 1, 'w'],
    [56, 50, 52, 2.9, 0.92, 100, -1, 'w'],
    [22, 62, 64, 3.1, 0.74, 130, 1, 'w']
  ],
  cloudy: [
    [-12, 22, 60, 2.7, 0.9, 85, 1, 'l'],
    [42, 16, 62, 2.9, 0.84, 120, -1, 'w'],
    [20, 44, 66, 2.7, 0.92, 105, 1, 'l'],
    [-8, 58, 60, 2.8, 0.88, 95, -1, 'w'],
    [34, 60, 80, 3.1, 0.82, 115, 1, 'l']
  ],
  grey: [
    [-12, 20, 62, 2.7, 0.92, 90, 1, 'g'],
    [40, 14, 64, 2.9, 0.88, 130, -1, 'g'],
    [18, 42, 66, 2.7, 0.94, 110, 1, 'g'],
    [-8, 62, 62, 2.8, 0.92, 100, -1, 'g'],
    [34, 64, 82, 3.1, 0.92, 120, 1, 'g']
  ],
  dark: [
    [-14, 16, 66, 2.7, 0.96, 80, 1, 'd'],
    [38, 10, 68, 2.9, 0.94, 120, -1, 'd'],
    [16, 38, 70, 2.7, 0.96, 100, 1, 'd'],
    [-8, 60, 64, 2.8, 0.94, 90, -1, 'd'],
    [32, 62, 86, 3.1, 0.92, 110, 1, 'd']
  ],
  gusty: [
    [-22, 36, 74, 6.4, 0.78, 26, 1, 'w'],
    [28, 50, 86, 7, 0.66, 32, -1, 'w'],
    [4, 64, 72, 6.4, 0.6, 28, 1, 'w'],
    [50, 26, 66, 6, 0.55, 36, -1, 'w']
  ],
  banks: [
    [-20, 48, 100, 4.2, 0.55, 140, 1, 'l'],
    [20, 64, 100, 4.4, 0.5, 160, -1, 'l']
  ]
};

// scene: {sky: [top, middle, bottom], haze: "r,g,b" glow along the horizon, clouds, orb: 'sun' | 'moon', stars,
//         fx: [type, level] (rain | snow | sleet | hail | lightning | fog, level 1 light .. 3 heavy),
//         dim: extra multiplier for the cloud opacity at night}
const SCENES = {
  clear: {
    day: {
      sky: ['#1558b8', '#2f7ad4', '#5fa3e6'],
      haze: '150,205,255',
      clouds: 'wisps',
      orb: 'sun'
    },
    night: {
      sky: ['#050b22', '#0e2152', '#21468f'],
      haze: '60,110,200',
      clouds: 'none',
      orb: 'moon',
      stars: true
    }
  },
  partly: {
    day: {
      sky: ['#1a5eba', '#3380d6', '#68a8e6'],
      haze: '150,205,255',
      clouds: 'partly',
      orb: 'sun'
    },
    night: {
      sky: ['#071030', '#13265a', '#2c4f8c'],
      haze: '60,110,200',
      clouds: 'partly',
      orb: 'moon',
      stars: true,
      dim: 0.85
    }
  },
  cloudy: {
    day: {sky: ['#3b5a80', '#5a7ba2', '#86a3c4'], haze: '170,200,230', clouds: 'cloudy'},
    night: {
      sky: ['#0f1829', '#1d2b45', '#34496b'],
      haze: '70,100,150',
      clouds: 'cloudy',
      dim: 0.8
    }
  },
  rain: {
    day: {
      sky: ['#2e4666', '#46618a', '#6b87aa'],
      haze: '150,180,215',
      clouds: 'grey',
      fx: ['rain', 1]
    },
    night: {
      sky: ['#0a1120', '#15223a', '#2a3d5c'],
      haze: '60,90,140',
      clouds: 'grey',
      fx: ['rain', 1],
      dim: 0.8
    }
  },
  pouring: {
    day: {
      sky: ['#243850', '#394f70', '#566e90'],
      haze: '130,160,195',
      clouds: 'dark',
      fx: ['rain', 3]
    },
    night: {
      sky: ['#070c17', '#101a2c', '#223049'],
      haze: '50,80,125',
      clouds: 'dark',
      fx: ['rain', 3],
      dim: 0.8
    }
  },
  storm: {
    day: {
      sky: ['#232f45', '#364560', '#546680'],
      haze: '120,145,185',
      clouds: 'dark',
      fx: ['lightning', 2]
    },
    night: {
      sky: ['#060912', '#0d1424', '#1c2840'],
      haze: '50,75,125',
      clouds: 'dark',
      fx: ['lightning', 2],
      dim: 0.8
    }
  },
  hail: {
    day: {
      sky: ['#2c4260', '#445d80', '#647f9e'],
      haze: '140,170,205',
      clouds: 'dark',
      fx: ['hail', 2]
    },
    night: {
      sky: ['#080e1b', '#131e33', '#26364f'],
      haze: '55,85,130',
      clouds: 'dark',
      fx: ['hail', 2],
      dim: 0.8
    }
  },
  snow: {
    day: {
      sky: ['#3a5578', '#52729a', '#6c88ab'],
      haze: '185,208,235',
      clouds: 'grey',
      fx: ['snow', 2]
    },
    night: {
      sky: ['#101a2c', '#1f2f4a', '#3a5073'],
      haze: '90,120,175',
      clouds: 'grey',
      fx: ['snow', 2],
      dim: 0.8
    }
  },
  sleet: {
    day: {
      sky: ['#40597a', '#5d7899', '#8499b3'],
      haze: '175,198,225',
      clouds: 'grey',
      fx: ['sleet', 2]
    },
    night: {
      sky: ['#0d1626', '#1a2940', '#31465f'],
      haze: '80,110,160',
      clouds: 'grey',
      fx: ['sleet', 2],
      dim: 0.8
    }
  },
  fog: {
    day: {
      sky: ['#54677f', '#74879e', '#9fb0c2'],
      haze: '215,226,238',
      clouds: 'banks',
      fx: ['fog', 2]
    },
    night: {
      sky: ['#131b28', '#233044', '#3b4d66'],
      haze: '90,115,155',
      clouds: 'banks',
      fx: ['fog', 2],
      dim: 0.8
    }
  },
  windy: {
    day: {sky: ['#1a62bf', '#3585da', '#6aaee8'], haze: '155,208,255', clouds: 'gusty'},
    night: {
      sky: ['#071032', '#132860', '#2a4f90'],
      haze: '60,110,200',
      clouds: 'gusty',
      stars: true,
      dim: 0.8
    }
  },
  exceptional: {
    day: {sky: ['#5a4a42', '#7a675c', '#a18f80'], haze: '215,190,165', clouds: 'grey'},
    night: {
      sky: ['#17110f', '#2a201b', '#443730'],
      haze: '120,90,70',
      clouds: 'grey',
      dim: 0.8
    }
  },
  unavailable: {
    day: {sky: ['#2a3447', '#394760', '#506079'], haze: '110,130,165', clouds: 'banks'},
    night: {sky: ['#2a3447', '#394760', '#506079'], haze: '110,130,165', clouds: 'banks'}
  }
};

/** HA condition -> scene group. Unknown states use 'cloudy'. */
export const GROUP = {
  sunny: 'clear',
  'clear-night': 'clear',
  partlycloudy: 'partly',
  cloudy: 'cloudy',
  fog: 'fog',
  hail: 'hail',
  lightning: 'storm',
  'lightning-rainy': 'storm',
  pouring: 'pouring',
  rainy: 'rain',
  snowy: 'snow',
  'snowy-rainy': 'sleet',
  windy: 'windy',
  'windy-variant': 'windy',
  exceptional: 'exceptional'
};

/** The top stop of a sky, darkened: the (saturated, not grey) colour of the scrim that keeps the text readable. */
function scrimOf(hex) {
  const channel = (i) => Math.round(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * 0.55);
  return `${channel(0)},${channel(1)},${channel(2)}`;
}

/**
 * The scene for a condition at day or night. `condition` null = entity unavailable.
 * Clouds come back resolved: {x, y, w, ar, o, drift, dir, lit, shade, hi}.
 */
export function skyFor(condition, day) {
  const group = condition === null ? 'unavailable' : GROUP[condition] || 'cloudy';
  const scene = SCENES[group][day ? 'day' : 'night'];
  const tones = TONES[day ? 'day' : 'night'];
  const clouds = CLOUDS[scene.clouds].map(([x, y, w, ar, o, drift, dir, tone]) => ({
    x,
    y,
    w,
    ar,
    o: o * (scene.dim ?? 1),
    drift,
    dir,
    lit: tones[tone][0],
    shade: tones[tone][1],
    hi: tones[tone][2]
  }));
  return {group, ...scene, scrim: scrimOf(scene.sky[0]), clouds};
}
