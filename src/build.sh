#!/bin/bash
cd /home/claude/twin
python3 - <<'PY'
head=open('p1.html').read().replace('</style>', open('extra.css').read()+'</style>',1)
libs='''<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Reflector.js"></script>
'''
js='\n'.join(open(f).read() for f in ['j1_core.js','j2_scene.js','j3_ui.js'])
open('index.html','w').write(head+libs+'<script>\n'+js+'\n</script>\n'); open('all.js','w').write(js)
PY
node --check all.js && echo BUILD_OK
