# usage: python3 scripts/set-photo.py site/pages/x.html /images/gen/name "Alt text" ["object-position"]
import sys, json, re
f, src, alt = sys.argv[1:4]; pos = sys.argv[4] if len(sys.argv) > 4 else None
s = open(f).read()
m = re.match(r'^<!--\s*(\{[\s\S]*?\})\s*-->', s)
fm = json.loads(m.group(1))
fm['photo'] = [src, alt] + ([pos] if pos else [])
head = m.group(1)
line = '  "photo": ' + json.dumps(fm['photo'], ensure_ascii=False) + ','
if '"photo":' in head: head = re.sub(r'  "photo": .*,\n', line + '\n', head)
else: head = head.replace('{\n', '{\n' + line + '\n', 1)
s = s.replace(m.group(1), head, 1)
json.loads(head)  # validate
open(f, 'w').write(s); print('ok', f)
