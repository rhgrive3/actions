"""Original folded market terrain. All coordinates are INKWAVE WU, not metres.

One canonical half, exact 180-degree rotation, then central self-symmetric floors.
Geometry is independent of the game. No imports or changes to public maps.
"""
from copy import deepcopy

def build():
    d = dict(id='tidewater', name='Tidewater Plaza',
             concept='折れた段丘市場 / Folded market terraces',
             bounds=[-42,42,-72,72], waterY=-1.6,
             floors=[], ramps=[], obstacles=[], spawns=[], routes=[], drops=[],
             notes=[])
    def floor(id, rect, y, role, suspended=False, material='solid'):
        d['floors'].append(dict(id='A_'+id, rect=rect, y=y,
            bottom=y-.6 if suspended else -4., material=material, role=role))
    def ramp(id, rect, axis, y0, y1, role):
        d['ramps'].append(dict(id='A_'+id,rect=rect,axis=axis,y0=y0,y1=y1,
            thickness=.6,role=role))
    def obstacle(id,rect,y0,y1,role,paint=True):
        d['obstacles'].append(dict(id='A_'+id,rect=rect,y0=y0,y1=y1,
            role=role,paint=paint))
    # Arrival is a compact hub with three exits at different heights.
    floor('spawn',[-10,10,-72,-64],4.8,'protected launch court; three exits')
    ramp('arrival_ramp',[-7,7,-64,-56],'z',4.8,3.6,'14-wide descent; 4-wide exits around spawn screen')
    floor('arrival',[-18,18,-56,-46],3.6,'civic arrival court and ranked goal approach')
    ramp('west_exit',[-18,-10,-70,-64],'x',3.6,4.8,'independent west spawn exit')
    floor('west_landing',[-30,-18,-70,-58],3.6,'west departure landing')
    ramp('west_descent',[-30,-18,-58,-50],'z',3.6,2.4,'descend beside arrival court')
    floor('west_terrace',[-38,-18,-50,-30],2.4,'broad inhabited terrace; decision to high market or low street')
    ramp('east_exit',[10,22,-70,-64],'x',4.8,2.4,'independent east spawn exit')
    floor('east_civic',[22,34,-70,-46],2.4,'east civic courtyard; no continuous back-row floor')
    ramp('civic_cross',[18,22,-54,-48],'x',3.6,2.4,'lateral recovery between arrival and east court')
    # Central direct route descends locally. Flanks keep different heights here.
    ramp('main_descent',[-10,2,-46,-34],'z',3.6,1.2,'12-wide local descent; tower-compatible corridor')
    floor('lower_court',[-14,10,-34,-20],1.2,'lower civic court; regroup and exchange routes')
    ramp('west_exchange',[-18,-14,-34,-30],'x',2.4,1.2,'short terrace-to-court connection; 4-wide landing')
    ramp('central_descent',[0,10,-20,-8],'z',1.2,0.,'direct approach to neutral basin')
    # An inhabited high market, not a row of cover boxes.
    ramp('market_west_rise',[-36,-28,-30,-18],'z',2.4,4.8,'8-wide rise from west terrace')
    floor('market_hall',[-36,-24,-18,-6],4.8,'upper market hall above low street',True)
    floor('market_edge',[-36,-30,-6,0],4.8,'solid waterside market edge',True)
    floor('market_grate',[-30,-24,-6,0],4.8,'short mesh section; swim falls onto low underpass',True,'grate')
    floor('market_bridge',[-24,-8,-6,0],4.8,'inhabited bridge across lower routes; offset from opponent',True)
    # Lower street and a second complete return ramp. No floor hidden under ramp.
    ramp('low_street_entry',[-22,-14,-30,-24],'x',0.,1.2,'court to sheltered low market street')
    floor('low_entry',[-28,-22,-30,-24],0.,'low street ramp landing')
    floor('low_turn',[-28,-16,-24,-20],0.,'wide turn; choose underpass or return up')
    floor('low_street',[-28,-22,-20,-6],0.,'continuous street underneath market; open at both ends')
    ramp('market_return',[-22,-16,-20,-6],'z',0.,4.8,'second high-market access, 34.3 percent grade')
    # East is a short belvedere with transverse descent, not a matching west lane.
    ramp('east_descent',[22,34,-46,-38],'z',2.4,1.2,'east court to waterside middle terrace')
    floor('east_terrace',[18,38,-38,-28],1.2,'waterside middle terrace; width changes at forecourt')
    floor('east_turn',[18,26,-28,-20],1.2,'turn landing beside belvedere rise')
    floor('court_cross',[10,18,-32,-24],1.2,'lateral merge with lower civic court')
    ramp('belvedere_rise',[26,34,-28,-20],'z',1.2,3.6,'rise at outside edge; not full-width')
    floor('belvedere',[24,38,-20,-8],3.6,'east viewing court; attack mid from a different height')
    ramp('belvedere_descent',[16,24,-18,-10],'x',0.,3.6,'transverse ramp down to low central arm')
    floor('central_arm',[10,16,-18,-8],0.,'low return from belvedere; grounded alternative to high market')
    # Actual cover volumes; top surfaces are not counted as designed floor terrain.
    obstacle('spawn_front_screen',[-3,3,-64.8,-64],4.8,7.8,'block long center-to-spawn sightlines; two 4-wide ramp entries')
    obstacle('arrival_screen',[-16,-10,-55,-53],3.6,6.8,'turn the spawn-side sightline, leave goal and three exits open')
    obstacle('terrace_screen',[-34,-30,-44,-38],2.4,5.6,'divide broad terrace into entry and forward court')
    obstacle('civic_screen',[28,32,-60,-55],2.4,5.6,'east departure sightline break')
    obstacle('court_cover',[5,9,-32,-30],1.2,2.4,'low regroup cover, outside tower corridor')
    obstacle('east_screen',[33,37,-37,-34],1.2,4.2,'turn waterside approach without blocking the inner merge')
    obstacle('market_screen',[-35,-31,-16,-13],4.8,7.8,'upper-market long sightline break')
    obstacle('bridge_cover',[-13,-11,-6,-4],4.8,6.0,'partial bridge cover leaves a 4-wide passage and return-ramp outlet clear')
    obstacle('mid_screen',[-6,-4,-1,4],0.,2.4,'offset central sightline break; objectives remain clear')
    # Guard geometry only at dangerous edges; designated downward openings remain.
    obstacle('market_sea_lip',[-36,-35.5,-12,0],4.8,5.7,'visible water-edge lip; jumpable, not safety guarantee',False)
    obstacle('belvedere_sea_lip',[37.5,38,-20,-8],3.6,4.5,'water-edge reading and brief cover',False)
    def rotate_rect(r):return [-r[1],-r[0],-r[3],-r[2]]
    for collection in ('floors','ramps','obstacles'):
        for a in list(d[collection]):
            b=deepcopy(a);b['id']=a['id'].replace('A_','B_',1)
            b['rect']=rotate_rect(a['rect'])
            if collection=='ramps':b['y0'],b['y1']=a['y1'],a['y0']
            d[collection].append(b)
    d['floors'] += [
        dict(id='C_basin',rect=[-16,16,-8,8],y=0.,bottom=-4.,material='solid',role='neutral civic basin; center objective with several entrances'),
        dict(id='C_west_underpass',rect=[-30,-16,-6,6],y=0.,bottom=-4.,material='solid',role='market underpass; open central and street exits'),
        dict(id='C_east_underpass',rect=[16,30,-6,6],y=0.,bottom=-4.,material='solid',role='rotated lower market underpass')]
    d['spawns']=[dict(id='A',point=[0,4.8,-68],floor='A_spawn'),dict(id='B',point=[0,4.8,68],floor='B_spawn')]
    d['routes']=[
      dict(id='A_direct',team='A',role='central descent, regroup, neutral basin',points=[[0,4.8,-68],[5,4.8,-68],[5,4.8,-64],[5,3.6,-56],[-4,3.6,-50],[-4,3.6,-46],[-4,1.2,-34],[-4,1.2,-26],[4,1.2,-26],[4,1.2,-20],[4,0,-8],[0,0,0]]),
      dict(id='A_market',team='A',role='west terrace and high market; drop to center',points=[[0,4.8,-68],[-10,4.8,-67],[-18,3.6,-67],[-24,3.6,-64],[-24,3.6,-58],[-24,2.4,-50],[-24,2.4,-34],[-32,2.4,-34],[-32,2.4,-30],[-32,4.8,-18],[-32,4.8,-17.2],[-28,4.8,-17.2],[-28,4.8,-10],[-27,4.8,-3],[-16,4.8,-3],[-10,4.8,-3]]),
      dict(id='A_low',team='A',role='sheltered low market street; attack center below bridge',points=[[-4,1.2,-26],[-14,1.2,-27],[-22,0,-27],[-25,0,-27],[-25,0,-22],[-25,0,-12],[-25,0,-3],[-10,0,-3],[-2,0,-3],[0,0,0]]),
      dict(id='A_east',team='A',role='east court, local rise, transverse descent to center',points=[[0,4.8,-68],[10,4.8,-67],[22,2.4,-67],[25,2.4,-64],[25,2.4,-46],[25,1.2,-38],[30,1.2,-31],[30,1.2,-28],[30,3.6,-20],[30,3.6,-14],[24,3.6,-14],[16,0,-14],[13,0,-14],[13,0,-8],[8,0,-5],[2,0,-5],[0,0,0]]),
      dict(id='A_market_return',team='A',role='safe mesh/drop recovery via second ramp',points=[[-25,0,-3],[-25,0,-12],[-25,0,-22],[-19,0,-22],[-19,0,-20],[-19,4.8,-6],[-16,4.8,-3]])]
    common=next(r['points'] for r in d['routes'] if r['id']=='A_market_return')
    d['routes'] += [dict(id='A_mesh_recovery',team='A',role='exact mesh landing to upper market',points=[[-27,0,-3]]+common),
                    dict(id='A_bridge_recovery',team='A',role='exact bridge drop landing to upper market',points=[[-6.8,0,-3]]+common)]
    next(r for r in d['routes'] if r['id']=='A_low')['parentRoute']='A_direct'
    for a in list(d['routes']):
        b=deepcopy(a);b['id']=a['id'].replace('A_','B_',1);b['team']='B'
        b['points']=[[-x,y,-z] for x,y,z in a['points']];d['routes'].append(b)
    d['drops']=[dict(id='A_mesh_drop',fromPoint=[-27,4.8,-3],to=[-27,0,-3],returnRoute='A_mesh_recovery',kind='grate',note='4.8-WU fall; animation/hard landing unverified'),
                dict(id='A_bridge_drop',fromPoint=[-8.8,4.8,-3],to=[-6.8,0,-3],returnRoute='A_bridge_recovery',kind='edge',note='predeparture point; move east past x=-8 then fall, never vertically through the solid slab')]
    for a in list(d['drops']):
        b=deepcopy(a);b['id']=a['id'].replace('A_','B_',1)
        for k in ('fromPoint','to'):x,y,z=a[k];b[k]=[-x,y,-z]
        b['returnRoute']=a['returnRoute'].replace('A_','B_',1);d['drops'].append(b)
    a_tower=[[0,0,0],[0,0,-8],[4,0,-8],[4,1.2,-20],[4,1.2,-26],[-4,1.2,-26],[-4,1.2,-34],[-4,3.6,-46],[-4,3.6,-50]]
    d['rules']=dict(zones=[dict(rect=[-4,4,-4,4],y=0.)],
      rainmaker=dict(center=[0,0,0],checkpoints=[[7,1.2,-25],[-7,1.2,25]],goals=[[8,3.6,-50],[-8,3.6,50]]),
      tower=dict(path=list(reversed(a_tower))+[[-x,y,-z] for x,y,z in a_tower[1:]],sweepRadius=2.5,assumedHeight=8.0),
      clams=dict(baskets=[[-12,3.6,-49],[12,3.6,49]],pickupPoints=[[-24,2.4,-36],[24,2.4,36],[22,1.2,-30],[-22,1.2,30],[-25,0,-22],[25,0,22],[0,0,0]]))
    d['notes']=[
      'All rules are proposed isolated placements; production ranked definitions are unchanged.',
      'Five substantial horizontal heights, counted separately from ramps, cover tops and mesh.',
      'Water plane y=-1.6 matches the current runtime. Water beneath a suspended floor must be distinguished from lower walkable floor: roof silhouette never implies ground beneath it.',
      'Market underpasses have 4.2 WU nominal clear height. No return route requires a jump or a paintable wall.',
      'Spawn protection is a proposed 4.2-WU radius in the separate blockout; enemy exclusion and launch arcs need live-engine testing.',
      'A_low is a branch from A_direct at the lower court. Exact mesh/bridge recovery routes include each landing point before the shared return ramp.',
      'Objective and tower envelopes are static proposal checks, not proof of composed ranked runtime correctness.'
    ]
    return d
