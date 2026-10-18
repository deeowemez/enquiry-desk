"""Static mockups of the Enquiry Desk console. Invented data; no customer text appears anywhere.
Run: python3 build.py  (renders PNGs with headless chromium)."""
import subprocess, pathlib, random
random.seed(7)
OUT = pathlib.Path(__file__).parent

CSS = """
:root{--bg:#f6f5f2;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#7c7b76;--line:#e4e2dc;--grid:#ece9e2;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--crit:#d03b3b;--good:#0ca30c;--warn:#b57600;--soft1:#e8f1fc;--soft2:#fdeee7;--soft3:#e2f6ee;--soft4:#fdf3d9;--softc:#fbe9e9;--softg:#e5f5e5;}
*{box-sizing:border-box;margin:0}
body{font:14px/1.45 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--bg);width:1440px;height:1000px;overflow:hidden;display:flex}
.side{width:224px;background:var(--surface);border-right:1px solid var(--line);padding:20px 12px;display:flex;flex-direction:column;gap:2px;flex:none}
.brand{font-weight:700;font-size:16px;padding:4px 10px 2px}.brand small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.nav{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;color:var(--ink2);font-weight:500}
.nav.on{background:var(--soft1);color:#184f95}.nav .ic{width:18px;text-align:center}.nav .bd{margin-left:auto;background:var(--crit);color:#fff;border-radius:10px;font-size:11px;padding:1px 7px;font-weight:600}
.sp{flex:1}.who{color:var(--muted);font-size:12px;padding:10px}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{height:60px;display:flex;align-items:center;gap:12px;padding:0 28px;border-bottom:1px solid var(--line);background:var(--surface);flex:none}
.top h1{font-size:19px;font-weight:650;margin-right:auto}
.chip{border:1px solid var(--line);border-radius:8px;padding:6px 11px;background:var(--surface);color:var(--ink2);font-size:13px}
.seg{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13px}.seg span{padding:6px 11px;color:var(--ink2);background:var(--surface)}.seg .on{background:var(--ink);color:#fff}
.body{padding:22px 28px;display:flex;flex-direction:column;gap:18px;overflow:hidden;flex:1}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.card h3{font-size:14px;font-weight:650;margin-bottom:2px}.card .sub{color:var(--muted);font-size:12.5px;margin-bottom:12px}
.row{display:flex;gap:18px}.grow{flex:1;min-width:0}
.tiles{display:flex;gap:14px}.tile{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.tile .k{color:var(--ink2);font-size:12.5px}.tile .v{font-size:30px;font-weight:700;letter-spacing:-.5px;margin:2px 0}.tile .n{color:var(--muted);font-size:12px}
.banner{display:flex;align-items:center;gap:12px;border-radius:12px;padding:14px 18px;font-weight:600}
.banner.ok{background:var(--softg);color:#0b5f0b}.banner.attn{background:var(--soft4);color:#6b4600}.banner small{font-weight:400;display:block;opacity:.85}
.banner .btn{margin-left:auto}
.btn{background:var(--ink);color:#fff;border-radius:8px;padding:7px 14px;font-weight:600;font-size:13px;display:inline-block}.btn.alt{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line);font-size:12px}
td{padding:9px 10px;border-bottom:1px solid var(--grid);vertical-align:middle}tr:last-child td{border-bottom:0}
.ref{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--ink2)}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.p-auto{background:var(--soft1);color:#184f95}.p-clar{background:var(--soft2);color:#8a3210}.p-esc{background:var(--soft3);color:#0b6a49}.p-blk{background:var(--soft4);color:#6b4600}.p-fail{background:var(--softc);color:#8f1f1f}
.p-ok{background:var(--softg);color:#0b5f0b}.p-wait{background:#eee;color:#444}
.flag{color:var(--crit);font-weight:600}.mut{color:var(--muted)}.right{text-align:right}
.legend{display:flex;gap:14px;color:var(--ink2);font-size:12.5px;margin-bottom:8px;flex-wrap:wrap}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.note{color:var(--muted);font-size:12px;display:flex;align-items:center;gap:6px}
.scrim{position:absolute;inset:0;background:rgba(11,11,11,.38)}
.drawer{position:absolute;top:0;right:0;bottom:0;width:600px;background:var(--surface);border-left:1px solid var(--line);padding:22px 26px;display:flex;flex-direction:column;gap:16px;box-shadow:-12px 0 40px rgba(0,0,0,.12)}
.modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:760px;background:var(--surface);border-radius:14px;padding:22px 26px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.x{margin-left:auto;color:var(--muted);font-size:20px}
.kv{display:grid;grid-template-columns:150px 1fr;gap:7px 12px;font-size:13px}.kv dt{color:var(--muted)}
.step{display:grid;grid-template-columns:22px 1fr auto;gap:10px;padding:6px 0;align-items:start}.dot{width:18px;height:18px;border-radius:50%;background:var(--good);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700}.dot.stop{background:var(--s4);color:#fff}.dot.skip{background:#cfcdc6}
.step small{color:var(--muted);display:block}.hide{background:repeating-linear-gradient(45deg,#f0eee8,#f0eee8 6px,#e8e5de 6px,#e8e5de 12px);border-radius:8px;padding:10px 12px;color:var(--ink2);font-size:12.5px}
.bar{height:8px;border-radius:4px;background:var(--s1)}.track{background:var(--grid);border-radius:4px;height:8px}
.callout{font-size:12.5px;color:var(--ink2);background:#f1efe9;border-radius:8px;padding:9px 12px}
"""
NAV = [("Overview","▦"),("Needs a person","⚑"),("Enquiries","☰"),("Blocked & why","△"),("Facts","▤"),("Prompts","✎"),("Cost & models","$"),("Health","♥")]
def page(title, active, body, overlay="", top_right=None, badge=9):
    nav = "".join(f'<div class="nav {"on" if n==active else ""}"><span class="ic">{i}</span>{n}'
                  + (f'<span class="bd">{badge}</span>' if n=="Needs a person" else "") + '</div>' for n,i in NAV)
    tr = top_right if top_right is not None else ('<span class="chip">Last 14 days ▾</span><div class="seg"><span class="on">Real</span><span>Scoring runs</span><span>Both</span></div><span class="chip mut">Updated 1 min ago ⟳</span>')
    return f"""<!doctype html><meta charset=utf-8><style>{CSS}</style><body style="position:relative">
<aside class=side><div class=brand>Enquiry Desk<small>Meridian Tutors · demo data</small></div><div style="height:14px"></div>{nav}<div class=sp></div><div class=who>Signed in as Alex (staff)<br>Draft mockup · invented data</div></aside>
<div class=main><div class=top><h1>{title}</h1>{tr}</div><div class=body>{body}</div></div>{overlay}"""

OUTC = {"auto_send":("p-auto","✓ Cleared"),"clarify":("p-clar","? Question drafted"),"escalate":("p-esc","↗ To a person"),"blocked":("p-blk","! Blocked"),"failed":("p-fail","✕ Failed")}
def pill(o): c,t=OUTC[o]; return f'<span class="pill {c}">{t}</span>'
COL = {"auto_send":"var(--s1)","clarify":"var(--s2)","escalate":"var(--s3)","blocked":"var(--s4)","failed":"var(--crit)"}

def stacked(days, series, w=780, h=250):
    L,B,T=34,h-26,10; mx=max(sum(series[k][i] for k in series) for i in range(len(days))); mx=((mx+9)//10)*10
    bw=(w-L-10)/len(days); s=f'<svg width="{w}" height="{h}" font-size="11" fill="#7c7b76">'
    for g in range(0,5):
        y=B-(B-T)*g/4; s+=f'<line x1="{L}" x2="{w-8}" y1="{y}" y2="{y}" stroke="#ece9e2"/><text x="{L-6}" y="{y+4}" text-anchor="end">{int(mx*g/4)}</text>'
    for i,d in enumerate(days):
        x=L+i*bw+bw*.18; ww=bw*.64; y=B
        for k in series:
            v=series[k][i]
            if not v: continue
            hh=(B-T)*v/mx; y-=hh; s+=f'<rect x="{x:.1f}" y="{y+1:.1f}" width="{ww:.1f}" height="{max(hh-2,1):.1f}" rx="2" fill="{COL[k]}"/>'
        if i%2==0: s+=f'<text x="{x+ww/2:.1f}" y="{h-8}" text-anchor="middle">{d}</text>'
    return s+'</svg>'
def hbars(items, w=420, color="var(--s1)"):
    mx=max(v for _,v in items); s=""
    for k,v in items:
        s+=f'<div style="display:grid;grid-template-columns:210px 1fr 34px;gap:10px;align-items:center;margin:9px 0;font-size:13px"><span>{k}</span><div class="track"><div class="bar" style="width:{100*v/mx:.0f}%;background:{color}"></div></div><span class="right">{v}</span></div>'
    return s
def bars(vals, labels, w=520, h=190, color="var(--s1)", fmt=lambda v:f"${v:.2f}", steps=3, mx=None):
    L,B,T=40,h-24,8; mx=mx or max(vals)*1.1; bw=(w-L-6)/len(vals); s=f'<svg width="{w}" height="{h}" font-size="11" fill="#7c7b76">'
    for g in range(0,steps+1):
        y=B-(B-T)*g/steps; s+=f'<line x1="{L}" x2="{w-4}" y1="{y}" y2="{y}" stroke="#ece9e2"/><text x="{L-6}" y="{y+4}" text-anchor="end">{fmt(mx*g/steps)}</text>'
    for i,v in enumerate(vals):
        hh=(B-T)*v/mx; x=L+i*bw+bw*.2; s+=f'<rect x="{x:.1f}" y="{B-hh:.1f}" width="{bw*.6:.1f}" height="{hh:.1f}" rx="3" fill="{color}"/>'
        if i%2==0: s+=f'<text x="{x+bw*.3:.1f}" y="{h-7}" text-anchor="middle">{labels[i]}</text>'
    return s+'</svg>'

days=[f"{d} Oct" for d in range(5,19)]
ser={"auto_send":[3,5,4,6,2,0,0,7,9,8,6,5,8,4],"clarify":[1,2,1,2,0,0,0,2,3,2,1,1,2,1],"escalate":[2,3,2,4,1,0,0,3,4,3,2,3,3,2],"blocked":[1,1,0,2,1,0,0,2,2,1,1,1,2,1],"failed":[0,0,0,1,0,0,0,0,0,0,1,0,0,0]}
legend=lambda: '<div class=legend>'+''.join(f'<span><i style="background:{COL[k]}"></i>{OUTC[k][1][2:]}</span>' for k in OUTC)+'</div>'

ROWS=[("b6a9219f","Today 14:02","Pricing","blocked","Quoted a price that isn't in the fact table","—","Waiting 3 h","$0.0026"),
("622d91bf","Today 13:41","Scheduling","escalate","Safety flag: child wellbeing","⚑ wellbeing","Waiting 3 h","$0.0009"),
("e9dd78d4","Today 13:20","Deadlines","escalate","Date isn't verified in the facts","—","Waiting 4 h","$0.0021"),
("8a7670a4","Today 12:55","Course content","escalate","Routed to a person: course content","—","Waiting 4 h","$0.0007"),
("4c1f02aa","Today 11:30","Pricing","auto_send","—","—","Approved 11:42","$0.0024"),
("91d3be07","Today 10:12","Trial lessons","clarify","Asked which subject and level","—","—","$0.0019"),
("0fa8c5d2","Yesterday 22:48","Pricing","auto_send","—","—","—","$0.0023"),
("7be6310c","Yesterday 21:05","Prompt injection","escalate","Safety flag: injection attempt","⚑ injection","Taken over","$0.0008"),
("c3a90e14","Yesterday 18:40","Scheduling","blocked","Time not in the fact table","—","Waiting 20 h","$0.0027"),
("2d57f9b8","Yesterday 16:22","Refunds","failed","Failed at: draft (model timeout)","—","—","$0.0011")]
def rows_html(n=10, link=True):
    out=""
    for r in ROWS[:n]:
        ref,t,cat,o,why,fl,rev,cost=r
        out+=f'<tr><td><span class=ref>{ref}</span></td><td>{t}</td><td>{cat}</td><td>{pill(o)}</td><td>{why}</td><td class=flag>{"" if fl=="—" else fl}</td><td>{rev}</td><td class=right>{cost}</td><td><span class="btn alt">Open</span></td></tr>'
    return out
HEAD='<tr><th>Ref</th><th>Received (HK)</th><th>Topic</th><th>Outcome</th><th>Why</th><th>Flags</th><th>Review</th><th class=right>Cost</th><th></th></tr>'

# 1 Overview
tiles="".join(f'<div class=tile><div class=k>{k}</div><div class=v style="color:{c}">{v}</div><div class=n>{n}</div></div>' for k,v,n,c in [
 ("Needs a person","9","oldest waiting 20 h","#6b4600"),("Cleared without a person","54%","41 of 76 · nothing is sent automatically","var(--ink)"),("Blocked or failed","8","7 blocked · 1 failed","var(--ink)"),("Failures (24 h)","0","dead letter 0 · stuck 0","var(--good)"),("Average cost","$0.0023","per enquiry · $0.17 total","var(--ink)")])
ov=f"""<div class="banner attn"><span style="font-size:20px">⚑</span><div>9 enquiries are waiting for a person<small>3 are safety cases. Oldest has waited 20 hours.</small></div><span class=btn>Review them →</span></div>
<div class=tiles>{tiles}</div>
<div class=row><div class="card grow"><h3>Enquiries per day, by outcome</h3><div class=sub>Hong Kong calendar days · weekends are quiet</div>{legend()}{stacked(days,ser,w=672,h=240)}</div>
<div class="card" style="width:430px"><h3>Why replies were blocked</h3><div class=sub>Click a bar to see the enquiries</div>{hbars([("Facts can't answer it",114),("Invented price",29),("Verifier: unsupported claim",21),("Time not in facts",2)],color="var(--s1)")}</div></div>
<div class=card><h3>Oldest waiting for a person</h3><div class=sub>Top 3 · customer details are not shown here, only the reference</div><table><tr><th>Ref</th><th>Topic</th><th>Outcome</th><th>Waiting</th><th></th></tr>
<tr><td class=ref>c3a90e14</td><td>Scheduling</td><td>{pill("blocked")}</td><td>20 h</td><td class=right><span class="btn alt">Open draft ↗</span></td></tr>
<tr><td class=ref>e9dd78d4</td><td>Deadlines</td><td>{pill("escalate")}</td><td>4 h</td><td class=right><span class="btn alt">Open draft ↗</span></td></tr>
<tr><td class=ref>622d91bf</td><td>Scheduling · <span class=flag>⚑ wellbeing</span></td><td>{pill("escalate")}</td><td>3 h</td><td class=right><span class="btn alt">Open draft ↗</span></td></tr></table></div>"""

# 2 Needs a person
q=""
for r,w in zip([ROWS[8],ROWS[2],ROWS[1],ROWS[0],ROWS[3]],["20 h","4 h","3 h","3 h","4 h"]):
    ref,t,cat,o,why,fl,rev,cost=r
    q+=f'<tr><td><span class=ref>{ref}</span></td><td>{cat}</td><td>{pill(o)}</td><td>{why}</td><td class=flag>{"" if fl=="—" else fl}</td><td><b>{w}</b></td><td class=right><span class="btn">Open draft ↗</span></td></tr>'
nq=f"""<div class=filters><span class=chip>Outcome: All ▾</span><span class=chip>Topic: All ▾</span><span class=chip>⚑ Safety cases only ☐</span><span class=note style="margin-left:auto">Showing 5 of 9 · sorted by longest waiting · opens the review page, where you approve or take over</span></div>
<div class=card><table><tr><th>Ref</th><th>Topic</th><th>Outcome</th><th>Why it needs you</th><th>Flags</th><th>Waiting</th><th></th></tr>{q}</table></div>
<div class=row><div class="card grow"><h3>What "waiting" means</h3><div class=sub style="margin:6px 0 0">Waiting = the system stopped and nobody has approved or taken over yet. Nothing is sent to a customer automatically. Approving creates a Gmail <b>draft</b> that a person sends.</div></div>
<div class="card" style="width:430px"><h3>Waiting by age</h3>{hbars([("under 4 hours",4),("4 – 12 hours",1),("over 12 hours",1)],color="var(--s2)")}</div></div>"""

# 3 Enquiries list
enq=f"""<div class=filters><span class=chip>🔍 Search by reference</span><span class=chip>Outcome: All ▾</span><span class=chip>Topic: All ▾</span><span class=chip>Review: All ▾</span><span class=chip>⚑ Flagged only ☐</span><span class=note style="margin-left:auto">76 enquiries · customer name, email and message are never shown</span></div>
<div class=card style="padding:6px 8px"><table>{HEAD}{rows_html(10)}</table></div><div class=right mut style="color:var(--muted)">Showing 1–10 of 76 · ‹ 1 2 3 … 8 ›</div>"""

# 4 Detail drawer
steps=[("Received","saved to the database before any model call","0.0 s","ok"),("Classified","Pricing · confidence 0.92 · English · model Nova 2 Lite","1.1 s · $0.0003","ok"),("Missing details derived (code)","none missing","—","ok"),("Routed (code)","not flagged, not sensitive → draft","—","ok"),("Draft written","from 3 facts · Nova 2 Lite","2.3 s · $0.0009","ok"),("Claims verified","2 of 3 claims supported by quoted evidence","1.8 s · $0.0014","ok"),("Validated","! price £190 is not in the fact table → blocked","—","stop"),("Recorded","action = blocked, sent to review","—","ok")]
st="".join(f'<div class=step><div class="dot {"stop" if k=="stop" else ""}">{"!" if k=="stop" else "✓"}</div><div><b>{a}</b><small>{b}</small></div><div class=mut style="font-size:12px;text-align:right">{c}</div></div>' for a,b,c,k in steps)
drawer=f"""<div class=scrim></div><div class=drawer>
<div style="display:flex;align-items:center;gap:10px"><div><div style="font-size:17px;font-weight:650">Enquiry b6a9219f</div><div class=mut style="font-size:12.5px">Received today 14:02 HK · Pricing</div></div><span class=x>✕</span></div>
<div style="display:flex;gap:8px">{pill("blocked")}<span class="pill p-wait">Waiting for a person · 3 h</span></div>
<div class=callout><b>Why it stopped:</b> the draft quoted a price that isn't in the fact table, so the system did not let it go out.</div>
<div><div style="font-weight:650;margin-bottom:4px">What happened, step by step</div>{st}</div>
<div class=hide>▣ Customer name, email, subject, message and draft text are not shown in this console. Use the button below to read them on the private review page.</div>
<div style="display:flex;gap:10px"><span class=btn>Open draft on review page ↗</span><span class="btn alt">Copy reference</span><span class="btn alt" style="margin-left:auto">Total cost $0.0026</span></div></div>"""
detail=page("Enquiries","Enquiries",enq,drawer)

# 5 Blocked & why
bl=f"""<div class=row><div class="card grow"><h3>Blocked replies by reason</h3><div class=sub>A reply can have several problems · the reason names are set by the system, not copied from the customer</div>{hbars([("Facts can't answer it",114),("Invented price",29),("Verifier: unsupported claim",21),("Time not in facts",2),("Date not in facts / unverified",2)],color="var(--s1)")}</div>
<div class="card" style="width:430px"><h3>Blocked share of drafts</h3><div class=sub>Blocking is the system working, not failing</div><div style="font-size:40px;font-weight:700">9%</div><div class=mut>7 of 76 enquiries · target: 0 invented claims reach a customer</div><div style="height:10px"></div><div class=callout>Invented claims in sendable replies: <b style="color:var(--good)">0</b> across every scoring run.</div></div></div>
<div class=card><h3>Questions the fact table couldn't answer</h3><div class=sub>Counted by topic, no customer text · each line suggests a fact to add</div>
<table><tr><th>Topic</th><th>Likely missing fact</th><th class=right>Times</th><th>Example refs</th><th></th></tr>
<tr><td>Scheduling</td><td>How lesson times convert to Hong Kong time</td><td class=right><b>9</b></td><td class=ref>c3a90e14 · 5f20b7de</td><td class=right><span class="btn alt">Add fact</span></td></tr>
<tr><td>Pricing</td><td>Price for more than one subject (bundle)</td><td class=right><b>7</b></td><td class=ref>b6a9219f · 0e41c9a3</td><td class=right><span class="btn alt">Add fact</span></td></tr>
<tr><td>Deadlines</td><td>Autumn term start date (unverified)</td><td class=right><b>6</b></td><td class=ref>e9dd78d4 · 7a3c1f90</td><td class=right><span class="btn alt">Review fact</span></td></tr>
<tr><td>Admissions</td><td>Interview coaching dates</td><td class=right><b>4</b></td><td class=ref>d81b6e25</td><td class=right><span class="btn alt">Add fact</span></td></tr></table></div>
<div class=card><h3>Blocked per day</h3><div class=sub>Spikes after a prompt or fact-table change are worth a look</div>{bars([1,1,0,2,1,0,0,2,2,1,1,1,2,1],[d[:2] for d in days],w=1110,h=120,color="var(--s4)",fmt=lambda v:f"{v:.0f}",steps=2,mx=2)}</div>"""
modal=f"""<div class=scrim></div><div class=modal><div style="display:flex;align-items:center"><div><div style="font-size:17px;font-weight:650">Invented price · 29 problems</div><div class=mut style="font-size:12.5px">The draft stated a price the fact table doesn't contain · 11 enquiries</div></div><span class=x>✕</span></div><div style="height:12px"></div>
<table><tr><th>Ref</th><th>Received</th><th>Topic</th><th>Review</th><th></th></tr>
<tr><td class=ref>b6a9219f</td><td>Today 14:02</td><td>Pricing</td><td>Waiting 3 h</td><td class=right><span class="btn alt">Details</span></td></tr>
<tr><td class=ref>a41e77c0</td><td>Mon 13 Oct</td><td>Pricing</td><td>Taken over</td><td class=right><span class="btn alt">Details</span></td></tr>
<tr><td class=ref>5d0c9e31</td><td>Mon 13 Oct</td><td>Pricing</td><td>Approved</td><td class=right><span class="btn alt">Details</span></td></tr>
<tr><td class=ref>19ef6a82</td><td>Sun 12 Oct</td><td>Pricing</td><td>Taken over</td><td class=right><span class="btn alt">Details</span></td></tr></table>
<div class=note style="margin-top:10px">Showing 4 of 11 · the usual cause: the model adds up a bundle price that isn't a listed fact</div></div>"""

# 6 Cost
costv=[0.0,0.0,0.0,0.01,0.0,0.0,0.0,0.34,0.11,0.0,0.01,0.0,0.01,0.0]
cost=f"""<div class=tiles><div class=tile><div class=k>Total spend (14 days)</div><div class=v>$0.48</div><div class=n>covered by AWS credits</div></div><div class=tile><div class=k>Average per enquiry</div><div class=v>$0.0023</div><div class=n>baseline $0.0024 · gate +25%</div></div><div class=tile><div class=k>Model calls</div><div class=v>312</div><div class=n>4 stages</div></div><div class=tile><div class=k>Credits left</div><div class=v>$98</div><div class=n>expire 9 Mar 2027</div></div></div>
<div class=row><div class="card grow"><h3>Spend per day</h3><div class=sub>Big days are scoring runs (24 cases each)</div>{bars(costv,[d[:2] for d in days],w=520,h=200)}</div>
<div class="card" style="width:560px"><h3>Which model runs each stage</h3><div class=sub>Set in one place; every cost row records its own model</div><table><tr><th>Stage</th><th>Model</th><th class=right>Share of cost</th></tr><tr><td>classify</td><td>Nova 2 Lite</td><td class=right>14%</td></tr><tr><td>draft</td><td>Nova 2 Lite</td><td class=right>38%</td></tr><tr><td>verify</td><td>Nova 2 Lite</td><td class=right>41%</td></tr><tr><td>clarify</td><td>Nova 2 Lite</td><td class=right>7%</td></tr></table><div class=callout style="margin-top:10px">Nova Pro on draft was tested: no accuracy gain, about 2× the draft cost.</div></div></div>"""

# 7 Health
health=f"""<div class="banner ok"><span style="font-size:20px">✓</span><div>All systems working<small>Last enquiry processed 12 minutes ago · no failures in the last 24 hours</small></div></div>
<div class=tiles><div class=tile><div class=k>Dead letter</div><div class=v style="color:var(--good)">0</div><div class=n>failed and not replayed</div></div><div class=tile><div class=k>Stuck</div><div class=v style="color:var(--good)">0</div><div class=n>"received" for over 10 min</div></div><div class=tile><div class=k>Failures (24 h)</div><div class=v style="color:var(--good)">0</div><div class=n>blocked replies don't count</div></div><div class=tile><div class=k>Last processed</div><div class=v>12 min</div><div class=n>14:08 HK</div></div></div>
<div class=row><div class="card grow"><h3>Recent failures</h3><div class=sub>Shows the stage that failed, never the customer's message</div><table><tr><th>Ref</th><th>When</th><th>Failed at</th><th>Cause</th><th>Status</th><th></th></tr>
<tr><td class=ref>2d57f9b8</td><td>Yesterday 16:22</td><td>draft</td><td>Model timeout</td><td><span class="pill p-ok">✓ Replayed</span></td><td class=right><span class="btn alt">Details</span></td></tr>
<tr><td class=ref>f08a1c66</td><td>Mon 13 Oct</td><td>classify</td><td>Model returned 503</td><td><span class="pill p-ok">✓ Replayed</span></td><td class=right><span class="btn alt">Details</span></td></tr>
<tr><td class=ref>e2c47b90</td><td>Sat 11 Oct</td><td>classify</td><td>AWS account hold (400)</td><td><span class="pill p-ok">✓ Replayed</span></td><td class=right><span class="btn alt">Details</span></td></tr></table></div>
<div class="card" style="width:430px"><h3>How a failure is handled</h3><div class=sub>Nothing is lost</div><div class=step><div class=dot>1</div><div><b>Row saved first</b><small>before any model call</small></div><div></div></div><div class=step><div class=dot>2</div><div><b>Marked failed + alert</b><small>Telegram message with a link</small></div><div></div></div><div class=step><div class=dot>3</div><div><b>Replayed</b><small>one command re-runs it</small></div><div></div></div><div class=callout style="margin-top:8px">Future: a "Replay" button here, for staff.</div></div></div>"""

# ---- Facts list
FACTS=[("pricing.subscription_per_subject_per_month","£95 per subject per month","pricing, course content",True,"Price list, Sep 2026","3 Oct"),
("pricing.dropin_single_lesson","£25 per single lesson","pricing",True,"Price list, Sep 2026","3 Oct"),
("pricing.trial","Free · one live lesson, past-paper bank, one recorded module · any available subject in its slot","pricing, trial",True,"Trial policy, Sep 2026","3 Oct"),
("pricing.discounts","None (deliberately empty: nothing to invent)","pricing",True,"Owner decision","3 Oct"),
("subjects.phys_alevel.available","No, waitlist only","course content, scheduling",True,"Timetable, Oct 2026","11 Oct"),
("admissions.personal_statement.price","£150, not included in a subscription","admissions",True,"Price list, Sep 2026","3 Oct"),
("support_hours","Mon–Fri, 09:00–18:00 UTC (17:00–02:00 Hong Kong)","scheduling, general",True,"Ops handbook","3 Oct"),
("lesson_schedule.maths_gcse","Saturdays 10:00 UK time","scheduling",True,"Timetable, Oct 2026","11 Oct"),
("term_dates.autumn_start","8 September 2026","deadlines",False,"Awaiting confirmation","3 Oct"),
("refund_policy","Handled case by case by a person; never auto-answered","refunds",True,"Owner decision","3 Oct")]
def fact_rows(extra=""):
    out=extra
    for k,v,sc,ver,src,ch in FACTS:
        vv='<span class="pill p-ok">✓ Verified</span>' if ver else '<span class="pill p-blk">! Unverified</span>'
        out+=f'<tr><td><span class=ref>{k}</span></td><td>{v}</td><td class=mut>{sc}</td><td>{vv}</td><td class=mut>{src}</td><td>{ch}</td><td><span class="btn alt">Edit</span></td></tr>'
    return out
FH='<tr><th>Fact</th><th>What the system may say</th><th>Used for</th><th>Status</th><th>Source</th><th>Changed</th><th></th></tr>'
newrow='<tr style="background:#f4f8fe"><td><span class=ref>scheduling.timezone_conversion</span></td><td>Lesson times are in UK time. Hong Kong is 7 hours ahead of UK summer time and 8 hours ahead in winter.</td><td class=mut>scheduling</td><td><span class="pill p-wait">Draft · not live</span></td><td class=mut>Ops handbook</td><td>Just now</td><td><span class="btn alt">Edit</span></td></tr>'
facts_body=f"""<div class="banner attn"><span style="font-size:20px">✎</span><div>1 draft change is waiting<small>New fact "scheduling.timezone_conversion" has not been tested yet. Customers still see the live set (v14).</small></div><span class=btn>Review and test</span></div>
<div class=filters><span class=chip>🔍 Search facts</span><span class=chip>Topic: All ▾</span><span class=chip>Status: All ▾</span><span class=chip style="margin-left:auto">Live set v14 · published 11 Oct · 24-case test: 22/24, 0 invented</span><span class=btn>+ Add fact</span></div>
<div class=card style="padding:6px 8px"><table>{FH}{fact_rows(newrow)}</table></div>
<div class=note>The system may state only what is in this table. A wrong value here is repeated confidently, so every change is tested on staging before it can go live.</div>"""
facts_top='<span class="chip">Live v14 · Draft v15</span>'
# ---- Edit drawer
dr=f"""<div class=scrim></div><div class=drawer style="width:640px;gap:12px;overflow:hidden">
<div style="display:flex;align-items:center"><div><div style="font-size:17px;font-weight:650">Add fact</div><div class=mut style="font-size:12.5px">scheduling.timezone_conversion · draft v15</div></div><span class=x>✕</span></div>
<div class=kv><dt>What the system may say</dt><dd style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#fff">Lesson times are in UK time. Hong Kong is 7 hours ahead of UK summer time and 8 hours ahead in winter.</dd>
<dt>Used for</dt><dd><span class="pill p-auto">scheduling</span> <span class="pill p-wait">+ add topic</span></dd>
<dt>Status</dt><dd><span class="pill p-ok">✓ Verified</span> <span class=mut>untick if unsure: unverified facts are never stated</span></dd>
<dt>Source (required)</dt><dd style="border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:#fff">Ops handbook, p. 4</dd></div>
<div><div style="font-weight:650;margin-bottom:4px">What changes</div><div class=callout><span class=mut>Before:</span> not in the table → time questions are blocked<br><span style="color:#0b5f0b"><b>After:</b></span> the system may give the conversion</div></div>
<div><div style="font-weight:650;margin-bottom:4px">Impact on past enquiries <span class=mut style="font-weight:400">(re-checked on staging, nothing sent)</span></div>
<table><tr><th>14 Scheduling enquiries</th><th class=right>Before</th><th class=right>After</th></tr><tr><td>Cleared</td><td class=right>5</td><td class=right><b>9</b></td></tr><tr><td>Blocked</td><td class=right>6</td><td class=right><b>2</b></td></tr><tr><td>To a person</td><td class=right>3</td><td class=right>3</td></tr></table><div class=note style="margin-top:6px">New invented claims: <b style="color:var(--good)">0</b> · <span style="color:var(--ink2)">Open the 4 changed ones to compare</span></div></div>
<div><div style="font-weight:650;margin-bottom:4px">24-case test on staging</div><div class=callout>Category 22/24 · safety flags 6/6 · actions <b>22/24</b> (was 21) · invented claims <b>0</b> · cost $0.0023 <b style="color:var(--good)">✓ passes the gate</b></div></div>
<div style="display:flex;gap:10px;margin-top:auto"><span class=btn>Publish (needs promoter)</span><span class="btn alt">Test on staging again</span><span class="btn alt">Save draft</span><span class="btn alt" style="margin-left:auto">Discard</span></div></div>"""
# ---- Prompts
PR=open("../../workflows/01-intake.mine.json").read()
import json as _j
_w=_j.loads(PR); _code=[n["parameters"]["jsCode"] for n in _w["nodes"] if n["name"]=="build draft request"][0]
_rules=_code[_code.index("const RULES = ["):_code.index("].join")].split("\n")[1:]
_txt="\n".join(l.strip().rstrip(",")[1:-1] if l.strip().startswith("'") else l for l in _rules)
import html as _h
_txt=_h.escape(_txt.replace("\\n","\n"))
tabs='<div style="display:flex;gap:6px">'+''.join(f'<span class="chip" style="{"background:var(--ink);color:#fff" if t=="draft" else ""}">{t}</span>' for t in ["classify","draft","verify","clarify"])+'</div>'
prompts_body=f"""<div class=filters>{tabs}<span class=chip style="margin-left:auto">Read-only · to change a prompt, use the test-and-promote flow</span></div>
<div class=row><div class="card grow"><h3>draft · instructions to the model</h3><div class=sub>Current live version · model Nova 2 Lite · the customer's message and the facts are added by the workflow and are always treated as data</div>
<pre style="font:12.5px/1.55 ui-monospace,Menlo,Consolas,monospace;background:#f6f5f2;border-radius:8px;padding:14px 16px;white-space:pre-wrap;margin:0">{_txt}</pre></div>
<div class="card" style="width:380px"><h3>Version history</h3><div class=sub>Every prompt change is tested first</div>
<div class=step><div class=dot>✓</div><div><b>v6 · live</b><small>11 Oct · "Never calculate a price"</small></div><div class=mut style="font-size:12px">21/24</div></div>
<div class=step><div class=dot>✓</div><div><b>v5</b><small>9 Oct · "No bundles unless in facts"</small></div><div class=mut style="font-size:12px">20/24</div></div>
<div class=step><div class=dot>✓</div><div><b>v4</b><small>7 Oct</small></div><div class=mut style="font-size:12px">19/24</div></div>
<div class=callout style="margin-top:8px"><b>Phase 2:</b> edit the tone and sign-off here. Safety rules, the classifier and the verifier stay locked.</div></div></div>"""
# ---- Re-check popup (over the enquiry list)
rc=f"""<div class=scrim></div><div class=modal style="width:820px"><div style="display:flex;align-items:center"><div><div style="font-size:17px;font-weight:650">Re-check enquiry c3a90e14</div><div class=mut style="font-size:12.5px">Run the same enquiry again against the draft facts (v15) · Scheduling</div></div><span class=x>✕</span></div><div style="height:14px"></div>
<div class=row><div class="card grow" style="background:#fbfaf7"><div class=mut style="font-size:12px">BEFORE · live facts v14</div><div style="margin:8px 0">{pill("blocked")}</div><div class=kv style="grid-template-columns:90px 1fr"><dt>Reason</dt><dd>Time not in the fact table</dd><dt>Claims</dt><dd>1 of 2 supported</dd><dt>Cost</dt><dd>$0.0027</dd></div><div style="height:12px"></div><span class="btn alt">Open original draft ↗</span></div>
<div class="card grow" style="border-color:#1baf7a"><div style="font-size:12px;color:#0b6a49;font-weight:600">AFTER · draft facts v15 · <span class="pill p-wait">RE-CHECK · not a customer reply</span></div><div style="margin:8px 0">{pill("auto_send")}</div><div class=kv style="grid-template-columns:90px 1fr"><dt>Reason</dt><dd>Every claim supported by fact scheduling.timezone_conversion</dd><dt>Claims</dt><dd>2 of 2 supported</dd><dt>Cost</dt><dd>$0.0023</dd></div><div style="height:12px"></div><span class="btn alt">View re-check draft ↗ (read-only)</span></div></div>
<div class=callout style="margin-top:12px">Re-checks run on <b>staging</b>: no Telegram alert, no Gmail draft, not counted in the statistics, and the original enquiry and its review stay untouched. The customer's message is re-sent by the system, never displayed here. Results can vary a little between runs.</div>
<div class=callout style="margin-top:10px"><b>Re-check pages have Approve disabled</b> and never create a Gmail draft, so a re-check can't produce a second draft for the customer.</div>
<div style="display:flex;gap:10px;margin-top:14px"><span class=btn>Re-check again</span><span class="btn alt">Re-check all 14 Scheduling enquiries</span><span class="btn alt" style="margin-left:auto">Apply to the original…</span></div>
<div class=note style="margin-top:8px">"Apply to the original" re-runs the original enquiry with the live facts after they are published. It is refused if the original already has a Gmail draft or has been sent, and it asks for confirmation first.</div></div>"""
list_page=page("Enquiries","Enquiries",enq)

pages={"1-overview":page("Overview","Overview",ov),"2-needs-a-person":page("Needs a person","Needs a person",nq),"3-enquiries":page("Enquiries","Enquiries",enq),
"4-enquiry-detail-drawer":detail,"5-blocked-and-why":page("Blocked & why","Blocked & why",bl),"6-blocked-reason-popup":page("Blocked & why","Blocked & why",bl,modal),
"9-facts":page("Facts","Facts",facts_body),"10-edit-fact-drawer":page("Facts","Facts",facts_body,dr),"11-prompts":page("Prompts","Prompts",prompts_body),"12-recheck-popup":page("Enquiries","Enquiries",enq,rc),"7-cost-and-models":page("Cost & models","Cost & models",cost),"8-health":page("Health","Health",health)}
for n,h in pages.items():
    f=OUT/f"{n}.html"; f.write_text(h)
    subprocess.run(["chromium","--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars","--force-device-scale-factor=1",f"--screenshot={OUT/(n+'.png')}","--window-size=1440,1087",f"file://{f}"],capture_output=True,timeout=90)
    from PIL import Image; p=OUT/(n+'.png'); Image.open(p).crop((0,0,1440,1000)).save(p)
    print(n, (OUT/(n+".png")).exists())
