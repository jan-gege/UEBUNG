# Baut die fertige Seite stottertherapie/index.html aus template2.html + ../t/core2.js + refwords.json
import os
H = os.path.dirname(os.path.abspath(__file__))
core = open(os.path.join(H, '..', 't', 'core2.js')).read()
core = core[core.index('// ==== CORE START'):core.index('// ==== CORE END') + len('// ==== CORE END')]
a0 = core.index('// Spektrogramm (Klangbild) zur Anzeige'); a1 = core.index('\n}\n', a0) + 3
core = core[:a0] + core[a1:]   # nur die Spektrogramm-Funktion entfernen (wird in der Seite nicht mehr genutzt)
t = open(os.path.join(H, 'template2.html')).read().replace('/*CORE*/', core).replace('/*REFWORDS*/', open(os.path.join(H, 'refwords.json')).read())
open(os.path.join(H, '..', '..', 'index.html'), 'w').write(t)
print(len(t), 'bytes')
