"""Recorta las fuentes variables de Google Fonts para la app (T-D1, CAM-106).

Uso (en el PC, una sola vez; los .woff2 resultantes se versionan):
    python scripts/subconjunto-fuentes.py <carpeta con los .woff2 completos> <carpeta de salida>

Fraunces: eje «SOFT» fijo (40 en vertical, 100 en cursiva), peso 500-700 y óptico 24-144 en vertical; la cursiva
(solo nombres de personas) queda estática. Solo español: ASCII, Latin-1 y puntuación común. Work Sans se usa sin recortar.
Requiere fonttools y brotli.
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2039, 0x203A, 0x20AC, 0x2212]

ENTRADA, SALIDA = Path(sys.argv[1]), Path(sys.argv[2])
SALIDA.mkdir(parents=True, exist_ok=True)

# nombre -> límites por eje
JOBS = {
    'fraunces-latin': {'SOFT': 40, 'wght': (500, 700), 'opsz': (24, 144)},
    'fraunces-italic-latin': {'SOFT': 100, 'wght': 500, 'opsz': 24},
    # Work Sans ya viene en el subconjunto «latin» de Google (50 KB) y fontTools falla con su glifo `space.tf`: se usa tal cual.
}

for nombre, limites in JOBS.items():
    f = TTFont(ENTRADA / f'{nombre}.woff2')
    f = instancer.instantiateVariableFont(f, limites)
    opciones = subset.Options()
    opciones.flavor = 'woff2'
    opciones.ignore_missing_glyphs = True
    opciones.glyph_names = False
    opciones.layout_features = ['kern', 'liga', 'tnum', 'lnum', 'ccmp', 'locl', 'mark', 'mkmk']
    sub = subset.Subsetter(opciones)
    sub.populate(unicodes=UNICODES)
    sub.subset(f)
    destino = SALIDA / f'{nombre}.woff2'
    f.flavor = 'woff2'
    f.save(destino)
    print(nombre, destino.stat().st_size, 'bytes')
