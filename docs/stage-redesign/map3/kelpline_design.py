"""Original isolated Kelpline coordinate proposal; no game imports or mutations."""


def build():
    d = dict(id="kelpline", name="Kelpline Terminal", concept="Offset ferry basins and interlocking transfer decks", bounds=[-44, 44, -72, 72], waterY=-1.6, floors=[], ramps=[], obstacles=[], spawns=[], routes=[], drops=[], rules={}, notes=[])

    def rr(r):
        return [-r[1], -r[0], -r[3], -r[2]]

    def rp(p):
        return [-p[0], p[1], -p[2]]

    def floor(id, rect, y, role, bottom=-4, material="solid", pair=True):
        d["floors"].append(dict(id=id, rect=rect, y=y, bottom=bottom, material=material, role=role))
        if pair:
            d["floors"].append(dict(id=id.replace("A_", "B_", 1), rect=rr(rect), y=y, bottom=bottom, material=material, role=role))

    def ramp(id, rect, axis, y0, y1, role):
        d["ramps"].append(dict(id=id, rect=rect, axis=axis, y0=y0, y1=y1, thickness=.6, role=role))
        d["ramps"].append(dict(id=id.replace("A_", "B_", 1), rect=rr(rect), axis=axis, y0=y1, y1=y0, thickness=.6, role=role))

    def obstacle(id, rect, y0, y1, role, paint=True):
        d["obstacles"].append(dict(id=id, rect=rect, y0=y0, y1=y1, role=role, paint=paint))
        d["obstacles"].append(dict(id=id.replace("A_", "B_", 1), rect=rr(rect), y0=y0, y1=y1, role=role, paint=paint))

    def route(id, role, points):
        d["routes"].append(dict(id=id, team="A", role=role, points=points))
        d["routes"].append(dict(id=id.replace("A_", "B_", 1), team="B", role=role, points=[rp(p) for p in points]))

    # Six inhabited elevations. A half occupies negative Z; B is its rotation.
    floor("A_spawn", [-12, 12, -72, -66], 6, "protected departure terrace")
    floor("A_headhouse", [-38, -4, -66, -60], 6, "outer departure terrace")
    floor("A_outer_top", [-44, -38, -66, -58], 6, "outer switchback landing")
    floor("A_high_neck", [-38, -30, -60, -52], 6, "transfer gallery above service quay", 5.4)
    floor("A_high_gantry", [-38, -20, -52, -34], 6, "transfer gantry above service quay", 5.4)
    floor("A_rear_concourse", [-20, 22, -60, -50], 4.8, "public distribution concourse")
    floor("A_rear_wing", [12, 22, -66, -60], 4.8, "return terrace beside spawn ramp")
    floor("A_low_quay", [-38, -20, -58, -34], 1.2, "service quay beneath transfer gantry")
    floor("A_outer_foot", [-44, -38, -42, -34], 1.2, "outer ramp recovery landing")
    floor("A_boarding_rear", [-12, 12, -42, -32], 3.6, "boarding approach")
    floor("A_boarding_main", [-22, 12, -32, -10], 3.6, "boarding court above service street", 3.0)
    floor("A_boarding_west", [-30, -22, -22, -10], 3.6, "boarding balcony and local recovery entrance", 3.0)
    floor("A_boarding_grate", [-30, -22, -28, -22], 3.6, "optional side grate beside existing recovery loop", 3.45, "grate")
    floor("A_service", [-30, 0, -28, -10], 0, "covered service street with two exits")
    floor("A_service_turn", [-42, -30, -28, -20], 0, "open drop landing and recovery court")
    floor("A_recovery_foot", [-42, -38, -20, -12], 0, "local boarding ramp landing")
    floor("A_cargo", [20, 40, -50, -24], 2.4, "cargo court around ferry basin")
    floor("A_cargo_inner", [12, 20, -42, -30], 2.4, "cargo approach terrace")
    floor("A_ferry", [24, 40, -16, -4], 1.2, "low ferry finger beside central channel")

    # Central ground and central bridge are independent traversable surfaces.
    floor("central_service", [-18, 18, -10, 10], 0, "low cross-terminal junction", pair=False)
    floor("central_west", [-12, -4, -10, 10], 3.6, "central transfer bridge", 3.0, pair=False)
    floor("central_east", [4, 12, -10, 10], 3.6, "central transfer bridge", 3.0, pair=False)
    floor("central_solid", [-4, 4, -10, 10], 3.6, "solid objective saddle", 3.0, pair=False)

    # All ramp footprints replace absent terrain; no hidden base remains beneath.
    ramp("A_spawn_ramp", [-4, 12, -66, -60], "z", 6, 4.8, "broad primary spawn descent")
    ramp("A_high_to_concourse", [-30, -20, -60, -54], "x", 6, 4.8, "local terrace connector")
    ramp("A_outer_descent", [-44, -38, -58, -42], "z", 6, 1.2, "waterside switchback to service quay")
    ramp("A_main_descent", [-8, 8, -50, -42], "z", 4.8, 3.6, "main boarding approach")
    ramp("A_gantry_to_boarding", [-20, -12, -42, -34], "x", 6, 3.6, "high flank rejoins boarding court")
    ramp("A_quay_to_service", [-30, -22, -34, -28], "z", 1.2, 0, "low flank enters covered street")
    ramp("A_boarding_recovery", [-38, -30, -20, -12], "x", 0, 3.6, "local return from safe drop court")
    ramp("A_rear_to_cargo", [12, 20, -50, -42], "z", 4.8, 2.4, "independent cargo approach")
    ramp("A_cargo_to_boarding", [12, 20, -30, -24], "x", 3.6, 2.4, "cross-route choice between cargo and boarding")
    ramp("A_cargo_to_ferry", [28, 36, -24, -16], "z", 2.4, 1.2, "ferry basin descent")
    ramp("A_ferry_to_center", [18, 24, -10, -6], "x", 0, 1.2, "low central side entrance")

    obstacle("A_spawn_screen", [-4, 4, -66.8, -66], 6, 8.6, "spawn sightline screen; two side exits")
    obstacle("A_concourse_kiosk", [-12, -8, -56, -52], 4.8, 7.2, "concourse view break")
    obstacle("A_gantry_cargo", [-34, -30, -48, -44], 6, 8.4, "upper gantry view break")
    obstacle("A_quay_cargo", [-34, -30, -48, -44], 1.2, 3.4, "lower service quay view break")
    obstacle("A_boarding_kiosk", [-16, -10, -24, -18], 3.6, 6.0, "boarding court shelter")
    obstacle("A_service_cover", [-10, -6, -24, -20], 0, 1.8, "lower street corner shelter clear of grate landing")
    obstacle("A_cargo_stack", [28, 34, -38, -35], 2.4, 4.8, "cargo court view break")
    obstacle("A_ferry_cover", [34, 38, -12, -8], 1.2, 3.2, "ferry finger shelter")
    obstacle("A_bridge_edge", [-12, -10, -9, -5], 3.6, 5.8, "bridge edge shelter clear of tower envelope")
    # This centered solid is invariant under rotation, so insert only once.
    d["obstacles"].append(dict(id="central_service_cover", rect=[-3, 3, -2, 2], y0=0, y1=1.8, role="low junction view break", paint=True))

    d["spawns"] = [dict(id="A", point=[0, 6, -68], floor="A_spawn"), dict(id="B", point=[0, 6, 68], floor="B_spawn")]
    route("A_main", "primary upper approach", [[0, 6, -68], [8, 6, -68], [8, 6, -66], [8, 4.8, -60], [0, 4.8, -54], [0, 4.8, -50], [0, 3.6, -42], [0, 3.6, -32], [7, 3.6, -16], [7, 3.6, 0], [0, 3.6, 0]])
    route("A_high_flank", "outer high transfer route", [[0, 6, -68], [-8, 6, -68], [-8, 6, -63], [-34, 6, -63], [-34, 6, -56], [-34, 6, -50], [-26, 6, -50], [-26, 6, -38], [-20, 6, -38], [-12, 3.6, -38], [-6, 3.6, -38], [-6, 3.6, -14], [-6, 3.6, 0]])
    route("A_low_flank", "waterside low service route", [[0, 6, -68], [-8, 6, -68], [-8, 6, -63], [-41, 6, -63], [-41, 6, -58], [-41, 1.2, -42], [-41, 1.2, -38], [-26, 1.2, -38], [-26, 1.2, -34], [-26, 0, -28], [-26, 0, -26], [-18, 0, -26], [-18, 0, -16], [-8, 0, -12], [-8, 0, -4]])
    route("A_cargo_flank", "cargo and ferry approach to low center", [[0, 6, -68], [8, 6, -68], [8, 6, -66], [8, 4.8, -60], [16, 4.8, -54], [16, 4.8, -50], [16, 2.4, -42], [24, 2.4, -38], [32, 2.4, -30], [32, 2.4, -24], [32, 1.2, -16], [28, 1.2, -8], [24, 1.2, -8], [18, 0, -8], [15, 0, -4]])
    route("A_recovery", "short return from drop court to boarding", [[-31.5, 0, -21], [-40, 0, -21], [-40, 0, -16], [-38, 0, -16], [-30, 3.6, -16], [-26, 3.6, -16]])
    route("A_grate_recovery", "short return from side grate landing to boarding", [[-26, 0, -25], [-40, 0, -25], [-40, 0, -16], [-38, 0, -16], [-30, 3.6, -16], [-26, 3.6, -16]])
    d["drops"] = [dict(id="A_boarding_drop", fromPoint=[-29.2, 3.6, -21], to=[-31.5, 0, -21], returnRoute="A_recovery", departure="move west past x=-30 before descent; the landing is outside the balcony footprint"), dict(id="B_boarding_drop", fromPoint=[29.2, 3.6, 21], to=[31.5, 0, 21], returnRoute="B_recovery", departure="move east past x=30 before descent; the landing is outside the balcony footprint"), dict(id="A_grate_drop", fromPoint=[-26, 3.6, -25], to=[-26, 0, -25], returnRoute="A_grate_recovery"), dict(id="B_grate_drop", fromPoint=[26, 3.6, 25], to=[26, 0, 25], returnRoute="B_grate_recovery")]
    d["rules"] = dict(zones=[dict(rect=[-18, -12, -6, 2], y=0), dict(rect=[12, 18, -2, 6], y=0)], rainmaker=dict(center=[0, 3.6, 0], checkpoints=[[0, 3.6, -35], [0, 3.6, 35]], goals=[[0, 4.8, -54], [0, 4.8, 54]]), tower=dict(path=[[7, 3.6, -28], [7, 3.6, -14], [7, 3.6, 0], [-7, 3.6, 0], [-7, 3.6, 14], [-7, 3.6, 28]], sweepRadius=2.5), clams=dict(baskets=[[0, 4.8, -54], [0, 4.8, 54]], pickupPoints=[[-18, 0, -16], [18, 0, 16], [24, 2.4, -32], [-24, 2.4, 32], [-26, 6, -48], [26, 6, 48], [0, 3.6, 0]]))
    d["notes"] = [
        "Design WU only; no real-world metre calibration is established.",
        "The six horizontal levels are genuine floor destinations, excluding ramps and cover tops; each has a different circulation role.",
        "All terrain, obstacles and rule placements have 180-degree rotational correspondence; this is geometric parity, not match-balance evidence.",
        "Main upper and low center routes intersect in plan but remain separate under the bridge; bridge underside is y3.0 above lower y0, and high gantry underside y5.4 above lower quay y1.2.",
        "Water occupies actual absent terrain between terminal fingers and along the outer switchback. No hidden full-bounds floor is present.",
        "Ramps are nominal planar design surfaces, grade at most45%; their emitted collision/ramp-end geometry must be tested before game integration.",
        "Designated drops land on solid floor but fall stun, momentum, squid grate fall-through and camera performance remain untested.",
        "Outer water edges require visible edge treatment and selected non-paint guardrails during later detailed dressing; those guards are not represented as certified collision geometry here.",
        "Zones occupy the uncovered six-unit-wide strips alongside the central bridge; explicit y bands remain required for any later target moved below stacked floors.",
        "Tower uses a conservative2.5WU planar envelope on y3.6. Continuous game collision, objective support and all rule scoring still require integration tests.",
        "Paint supports separate faces in source; HUD minimap still collapses stacked locations to the topmost surface, so this design does not imply minimap readiness.",
    ]
    return d
