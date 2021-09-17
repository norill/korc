/*!

Copyright (c) 2013, Gary Court
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/
var TYPES = {
	UNKNOWN:0,
	LFO_ENGINE:1,
	LFO_TANK:2,
	BOOSTER:3,
	DECOUPLER:4,
	DUCT:5,
	BRANCH:6
};

var PLANETS = [
    {name:"None", gravity:0},
	{name:"Moho", gravity:2.70},
	{name:"Eve", gravity:16.7},
	{name:"Gilly", gravity:0.049},
	{name:"Kerbin", gravity:9.81},
	{name:"Mun", gravity:1.63},
	{name:"Minmus", gravity:0.491},
	{name:"Duna", gravity:2.94},
	{name:"Ike", gravity:1.10},
	{name:"Dres", gravity:1.13},
	{name:"Jool", gravity:7.85},
	{name:"Laythe", gravity:7.85},
	{name:"Vall", gravity:2.31},
	{name:"Tylo", gravity:7.85},
	{name:"Bop", gravity:0.589},
	{name:"Pol", gravity:0.373},
	{name:"Eeloo", gravity:1.69}
];

var TYPE_NAMES_PLURAL = {
	1:"LF/O Engines",
	2:"LF/O Tanks",
	3:"Boosters",
	4:"Decouplers",
	5:"Fuel Ducts",
	6:"Branches"
}


var NO_ENGINE = {name:"", type:TYPES.LFO_ENGINE, size:0, cost:0, mass:0, thrust_min:0, thrust_max:0, isp_vac:0, isp_atm:0, thrust_atm:0, thrust_vac:0};
var FUEL_DUCT = {name:"FTX-2 External Fuel Duct", type:TYPES.DUCT, size:"radial", cost:650, mass:0, radial:true};  //mass:0.05, but have no mass in flight

var CONVERSION_FACTOR = 9.81;  //m/s^2

var OPTIMIZATION_NAMES = {
	"mass" : "Mass",
	"cost" : "Cost",
	"partCount" : "Part Count"
};

var NEEDS_OPTIMIZATION2 = {
	"partCount" : true
}

function pluck(key, obj) {
	return obj[key];
}

function pluckNumber(key, obj) {
	return +obj[key] || 0;
}

function sum(a, b) {
	return a + b;
}

var KSP = {
	Parts : {
		countUnique : function (parts) {
			var unique = [];
			var hash = {};
			if (parts) {
				for (var x = 0, xl = parts.length; x < xl; ++x) {
					var part = parts[x];
					if (!hash[part.name]) {
						var copy = Object.create(part);
						copy.count = 1;
						unique.push(copy);
						hash[part.name] = unique.length;  //we use index+1 so as not to get !!0
					} else {
						unique[hash[part.name]-1].count++;
					}
				}
			}
			return unique;
		},
		
		humanize : function (parts) {
			var strBuild = [];
			var uniqueParts = KSP.Parts.countUnique(parts);
			for (var x = 0, xl = uniqueParts.length; x < xl; ++x) {
				var part = uniqueParts[x];
				strBuild.push(part.name + " x" + part.count);
			}
			return strBuild.join(", ");
		}
	},
	
	Engine : {
		//Engine fuel consumption at specified atmospheric pressure (t/s)
		consumption : function (atm, engine) {
			atm = Math.min(Math.max(atm, 0), 1);  //Atmospheric pressure's affect on engines maxes out at 1 (TODO: Confirm this)
			return ((atm ? engine.thrust_atm : engine.thrust_vac) / ((engine.isp_vac * CONVERSION_FACTOR) - ((engine.isp_vac - engine.isp_atm) * CONVERSION_FACTOR * (atm || 0)))) || 0;
		},
		
		//Engine fuel consumption in vacuum (t/s)
		consumptionVac : function (engine) {
			return (engine.thrust_vac / (engine.isp_vac * CONVERSION_FACTOR)) || 0;
		},
		
		//Engine fuel consumption in atmosphere (t/s)
		consumptionAtm : function (engine) {
			return (engine.thrust_atm / (engine.isp_atm * CONVERSION_FACTOR)) || 0;
		}
	},
	
	Stage : {
		//Number of parts in this stage only
		partCount : function (stage) {
			return (
				((stage.others || 0).length || 0) +
				((stage.lfoTanks || 0).length || 0) +
				((stage.lfoEngines || 0).length || 0) +
				((stage.boosters || 0).length || 0) +
				((stage.decouplers || 0).length || 0) +
				((stage.branches || 0).length || 0)
			) * (stage.multiplier || 1);
		},
		
		tankCount : function (stage) {
			return (
				((stage.lfoTanks || 0).length || 0)
			) * (stage.multiplier || 1);
		},
		
		//Cost of this stage only
		cost : function (stage) {
			return (
				(stage.others ? stage.others.map(pluckNumber.bind(this, "cost")).reduce(sum, 0) : 0) +
				(stage.lfoTanks ? stage.lfoTanks.map(pluckNumber.bind(this, "cost")).reduce(sum, 0) : 0) + 
				(stage.lfoEngines ? stage.lfoEngines.map(pluckNumber.bind(this, "cost")).reduce(sum, 0) : 0) +
				(stage.boosters ? stage.boosters.map(pluckNumber.bind(this, "cost")).reduce(sum, 0) : 0) +
				(stage.decouplers ? stage.decouplers.map(pluckNumber.bind(this, "cost")).reduce(sum, 0) : 0) +
				(stage.branches ? stage.branches.map(pluckNumber.bind(this, "cost")).reduce(sum, 0) : 0)
			) * (stage.multiplier || 1);
		},
		
		//Thrust of active engines during this stage only (kN)
		thrust : function (stage, atm) {
			return (
				(stage.lfoEngines ? stage.lfoEngines.map(pluckNumber.bind(this, (atm ? "thrust_atm" : "thrust_vac"))).reduce(sum, 0) : 0) + 
				(stage.boosters ? stage.boosters.map(pluckNumber.bind(this, (atm ? "thrust_atm" : "thrust_vac"))).reduce(sum, 0) : 0)
			) * (stage.multiplier || 1);
		},
		
		//Mass of just the fuel of this stage only (t)
		massFuelStart : function (stage) {
			return (
				(stage.lfoTanks ? stage.lfoTanks.map(pluckNumber.bind(this, "mass_fuel")).reduce(sum, 0) : 0) +
				(stage.boosters ? stage.boosters.map(pluckNumber.bind(this, "mass_fuel")).reduce(sum, 0) : 0)
			) * (stage.multiplier || 1);
		},
		
		//Mass of this stage only (t)
		massStart : function (stage) {
			return (
				(stage.payload || 0) + 
				(stage.others ? stage.others.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.lfoTanks ? stage.lfoTanks.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) + stage.lfoTanks.map(pluckNumber.bind(this, "mass_fuel")).reduce(sum, 0) : 0) + 
				(stage.lfoEngines ? stage.lfoEngines.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.boosters ? stage.boosters.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) + stage.boosters.map(pluckNumber.bind(this, "mass_fuel")).reduce(sum, 0) : 0) +
				(stage.decouplers ? stage.decouplers.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.branches ? stage.branches.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0)
			) * (stage.multiplier || 1);
		},
		
		//Mass of this stage only at the specified time from the beginning of this stage's burn (t)
		massAt : function (stage, atm, time) {
			time = Math.max(time, 0);
			var mass = (stage.payload || 0) + 
				(stage.others ? stage.others.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.lfoEngines ? stage.lfoEngines.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.decouplers ? stage.decouplers.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.branches ? stage.branches.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0);
			if (stage.lfoTanks) {
				mass += stage.lfoTanks.map(pluckNumber.bind(this, "mass")).reduce(sum, 0);
				var fuelMass = stage.lfoTanks.map(pluckNumber.bind(this, "mass_fuel")).reduce(sum, 0);
				var consumption = (stage.lfoEngines ? stage.lfoEngines.map(KSP.Engine.consumption.bind(this, atm)).reduce(sum, 0) : 0);
				fuelMass -= consumption * time;
				if (fuelMass < 0) fuelMass = 0;
				mass += fuelMass;
			}
			if (stage.boosters) {
				mass += stage.boosters.map(pluckNumber.bind(this, "mass")).reduce(sum, 0);
				var fuelMass = stage.boosters.map(pluckNumber.bind(this, "mass_fuel")).reduce(sum, 0);
				var consumption = (stage.boosters ? stage.boosters.map(KSP.Engine.consumption.bind(this, atm)).reduce(sum, 0) : 0);
				fuelMass -= consumption * time;
				if (fuelMass < 0) fuelMass = 0;
				mass += fuelMass;
			}
			return mass * (stage.multiplier || 1);
		},
		
		//Mass of this stage only at end of burn (t)
		massEndStage : function (stage) {
			return (
				(stage.payload || 0) + 
				(stage.others ? stage.others.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.lfoTanks ? stage.lfoTanks.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) + 
				(stage.lfoEngines ? stage.lfoEngines.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.boosters ? stage.boosters.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.decouplers ? stage.decouplers.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0) +
				(stage.branches ? stage.branches.map(pluckNumber.bind(this, "mass")).reduce(sum, 0) : 0)
			) * (stage.multiplier || 1);
		},
		
		//Stage fuel consumption at specified atmospheric pressure (t/s)
		consumption : function (stage, atm) {
			return (
				(stage.lfoEngines ? stage.lfoEngines.map(KSP.Engine.consumption.bind(this, atm)).reduce(sum, 0) : 0) + 
				(stage.boosters ? stage.boosters.map(KSP.Engine.consumption.bind(this, atm)).reduce(sum, 0) : 0)
			) * (stage.multiplier || 1);
		},
		
		//Combined specific impulse at atmospheric pressure (m/s)
		impulse : function (stage, atm) {
			return (KSP.Stage.thrust(stage, atm) / KSP.Stage.consumption(stage, atm)) || 0;
		},
		
		//Time required to use all fuel in this stage only at full thrust at specified atmospheric pressure (s)
		timeStage : function (stage, atm) {
			return (KSP.Stage.massFuelStart(stage) / KSP.Stage.consumption(stage, atm)) || 0;
		}
	},
	
	Stages : {
		//Number of parts of all stages
		partCount : function (stage) {
			return KSP.Stage.partCount(stage) +
				(stage.next ? KSP.Stages.partCount(stage.next) : 0);
		},
		
		//Total cost of all stages
		cost : function (stage) {
			return KSP.Stage.cost(stage) +
				(stage.next ? KSP.Stages.cost(stage.next) : 0);
		},
		
		//Thrust of all active engines during this stage (kN)
		thrust : function (stage, atm) {
			return KSP.Stage.thrust(stage, atm) +
				(stage.parallel ? KSP.Stages.thrust(stage.next, atm) : 0);
		},
		
		//Total mass of all stages (t)
		massStart : function (stage) {
			return KSP.Stage.massStart(stage) +
				(stage.next ? KSP.Stages.massStart(stage.next) : 0);
		},
		
		//Total mass of all stages at the specified time from the beginning of this stage's burn, assuming no jettisoned stages (t)
		massAt : function (stage, atm, time) {
			var mass;
			
			if (time > 0) {
				var timeEmpty = KSP.Stages.timeStage(stage, atm);
				
				if (time < timeEmpty) {
					mass = KSP.Stage.massStart(stage) - (consumption * time);
				} else {
					mass = KSP.Stage.massEndStage(stage);  //assume we haven't jettisoned this stage yet
				}
				
				if (stage.next) {
					if (stage.parallel && !stage.asparagus) {
						mass += KSP.Stages.massAt(stage.next, atm, time);
					} else {
						mass += KSP.Stages.massAt(stage.next, atm, time - timeEmpty);
					}
				}
			} else {
				mass = KSP.Stages.massStart(stage);
			}
			
			return mass;
		},
		
		//Total mass of all stages at end of burn of this stage (t)
		massEndStage : function (stage, atm) {
			if (stage.parallel && !stage.asparagus) {
				return KSP.Stages.massAt(stage, atm, KSP.Stages.timeStage(stage, atm));
			}
			return KSP.Stage.massEndStage(stage) +
				(stage.next ? KSP.Stages.massStart(stage.next) : 0);
		},
		
		//Total mass of all stages at end of burn of all stages, assuming no jettisoned stages (t)
		massEndTotal : function (stage) {
			return KSP.Stage.massEndStage(stage) +
				(stage.next ? KSP.Stages.massEndTotal(stage.next) : 0);
		},
		
		//Thrust-to-Weight Ratio
		twr : function (stage, atm, planet) {
			return (KSP.Stages.thrust(stage, atm) / (KSP.Stages.massStart(stage) * planet.gravity)) || 0;
		},
		
		//Total stage fuel consumption at specified atmospheric pressure (t/s)
		consumption : function (stage, atm) {
			return KSP.Stage.consumption(stage, atm) +
				(stage.parallel ? KSP.Stages.consumption(stage.next, atm) : 0);
		},
		
		//Combined specific impulse at atmospheric pressure (m/s)
		impulse : function (stage, atm) {
			return (KSP.Stages.thrust(stage, atm) / KSP.Stages.consumption(stage, atm)) || 0;
		},
		
		//Delta-V at atmospheric pressure of this stage only (m/s)
		deltaVStage : function (stage, atm) {
			return (Math.log((KSP.Stages.massStart(stage) * 1000) / (KSP.Stages.massEndStage(stage, atm) * 1000)) * KSP.Stages.impulse(stage, atm)) || 0;
		},
		
		//Delta-V at atmospheric pressure of all stages (m/s)
		deltaVTotal : function (stage, atm) {
			return KSP.Stages.deltaVStage(stage, atm) +
				(stage.next ? KSP.Stages.deltaVTotal(stage.next, atm) : 0);
		},
		
		//Time required to use all fuel in this stage at full thrust at specified atmospheric pressure (s)
		timeStage : function (stage, atm) {
			return (KSP.Stage.massFuelStart(stage) / KSP.Stages.consumption(stage, atm)) || 0;
		},
		
		//Time required to use all fuel in all stages at full thrust at specified atmospheric pressure (s)
		timeTotal : function (stage, atm) {
			var time = KSP.Stages.timeStage(stage, atm);
			
			while (stage.next && stage.parallel && !stage.asparagus) {
				time = Math.max(time, KSP.Stages.timeStage(stage.next, atm));
				stage = stage.next;
			}
			
			if (stage.next) {
				time += KSP.Stages.timeTotal(stage.next, atm);
			}
			
			return time;
		},
		
		humanize : function (stage, planet, atm) {
			var strBuild = [];
			if (stage.multiplier > 1) strBuild.push("x" + stage.multiplier + ":");
			if (stage.payload) strBuild.push("Payload: " + stage.payload + "t");
			if (stage.lfoEngines && stage.lfoEngines.length) strBuild.push("Engines: " + KSP.Parts.humanize(stage.lfoEngines));
			if (stage.lfoTanks && stage.lfoTanks.length) strBuild.push("LF/O Tanks: " + KSP.Parts.humanize(stage.lfoTanks));
			if (stage.boosters && stage.boosters.length) strBuild.push("Boosters: " + KSP.Parts.humanize(stage.boosters));
			if (stage.branches && stage.branches.length) strBuild.push("Branches: " + KSP.Parts.humanize(stage.branches));
			if (stage.decouplers && stage.decouplers.length) strBuild.push("Decouplers: " + KSP.Parts.humanize(stage.decouplers));
			if (stage.others && stage.others.length) strBuild.push("Other: " + KSP.Parts.humanize(stage.others));
			if ((stage.lfoEngines && stage.lfoEngines.length) || (stage.boosters && stage.boosters.length)) {
				if (typeof atm === "number") strBuild.push("Delta-V: " + Math.round(KSP.Stages.deltaVStage(stage, atm)));
				if (planet) strBuild.push("TWR: " + KSP.Stages.twr(stage, atm, planet).toFixed(2));
			}
			if (stage.parallel) {
				if (stage.asparagus) strBuild.push("ASPARAGUS");
				else strBuild.push("PARALLEL");
			}
			return (stage.next ? KSP.Stages.humanize(stage.next, planet, atm) + "\n" : "") + strBuild.join("; ");
		}
	}
};

function fixArgs(args) {
	args.optimization = args.optimization || "mass";
	args.next = args.next || {payload:0};
	args.deltaV = args.deltaV || 0;
	args.planet = args.planet || PLANETS[0];
	args.minTWR = args.minTWR || 0;
	args.maxTWR = args.maxTWR || Infinity;
	args.minTime  = args.minTime || 0;
	args.maxTime = args.maxTime || Infinity;
	args.maxMass = (args.optimization !== "mass" && args.maxMass ? args.maxMass : Infinity);
	args.maxPartCount = (args.optimization !== "partCount" && args.maxPartCount ? args.maxPartCount : Infinity);
	args.atm = args.atm || 0;
	args.maxSymmetry = args.maxSymmetry || 8;
	args.maxStacks = args.maxStacks || 1;
	args.cluster = (args.maxStacks >= 1 || args.stagesMaxStacks >= 1) && !!args.cluster;
	args.asparagus = !!(args.next.lfoTanks || 0).length && !!args.asparagus;
	args.parallel = /*!!args.parallel || */args.asparagus;  //FIXME: Parallel disabled until supported without asparagus
	args.decoupling = (args.decoupling !== false);
	args.tankDiametersEqual = !!args.tankDiametersEqual;
	args.tankDiametersEqualEngineDiameter = args.tankDiametersEqual && !!args.tankDiametersEqualEngineDiameter;
	args.tankDiametersGreaterThenEngineDiameter = args.tankDiametersEqual && !!args.tankDiametersGreaterThenEngineDiameter;
	args.gimbal = args.gimbal;
	args.throttleable = args.throttleable;
	args.maxStages = args.maxStages || 1;
	args.stagesMaxStacks = args.stagesMaxStacks || 1;
	args.stagesAsparagus = !!args.stagesAsparagus;
	args.stagesParallel = !!args.stagesParallel || args.stagesAsparagus;
	args.stagesThrottleable = args.stagesThrottleable; 
	args.parts = args.parts || {};
	args.parts.lfoEngines = args.parts.lfoEngines || [];
	args.parts.lfoTanks = args.parts.lfoTanks || [];
	args.parts.boosters = args.parts.boosters || [];
	args.parts.stackDecouplers = args.parts.stackDecouplers || [];
	args.parts.radialDecouplers = args.parts.radialDecouplers || [];
	args.parts.branches = args.parts.branches || [];
}

function getMetric(stage, args) {
	var metric;
	if (args.optimization === "mass") {
		metric = KSP.Stages.massStart(stage);
	} else if (args.optimization === "cost") {
		metric = KSP.Stages.cost(stage);
	} else if (args.optimization === "partCount") {
		metric = KSP.Stages.partCount(stage);
	} else {
		metric = KSP.Stages.massStart(stage);
	}
	
	if (args.optimization2) {
		var metric2;
		if (args.optimization2 === "mass") {
			metric2 = 1 - (1 / KSP.Stages.massStart(stage));
		} else if (args.optimization2 === "cost") {
			metric2 = 1 - (1 / KSP.Stages.cost(stage));
		} else if (args.optimization2 === "deltaV") {
			metric2 = (1 / KSP.Stages.deltaVTotal(stage, args.atm));
		} else {
			metric2 = 1 - (1 / KSP.Stages.massStart(stage));
		}
		
		metric += metric2;
	}
	
	return metric;
}

function findOptimalStage(args) {
	fixArgs(args);
	
	var bestStage = null;
	var stage = null;
	//parallel stages must have two stacks, or the same # of stacks (if greater) as the next stage (simplifies design)
	var stackMultiplier = Math.max((args.next.multiplier || 1), ((args.parallel || (args.next.lfoEngines && (args.next.lfoEngines.length > 1 || (args.next.lfoEngines[0] || 0).last)) || (args.next.boosters && (args.next.boosters.length > 1 || (args.next.boosters[0] || 0).last))) ? 2 : 1));
	var bestStackDecoupler, bestRadialDecoupler;
	
	//
	//LF/O Engines
	//

	stage = {
		next : args.next,
		multiplier : 0,
		payload : 0,
		others : [],
		lfoEngines : [],
		lfoTanks : [],
		boosters : [],
		decouplers : [],
		branches : [],
		parallel : args.parallel,
		asparagus : args.asparagus,
		optimization : args.optimization,
		metric : Infinity,
		deltaV : 0
	};
	
	bestStackDecoupler = args.parts.stackDecouplers[0];
	bestRadialDecoupler = args.parts.radialDecouplers[0];
	
	nextEngine: for (var e = 0, el = args.parts.lfoEngines.length; e <= el; ++e) {
		var engine = args.parts.lfoEngines[e] || NO_ENGINE;
		
		if (typeof args.gimbal === "boolean" && args.gimbal != (engine.gimbal > 0)) continue nextEngine;
		if (typeof args.throttleable === "boolean" && typeof engine.throttleable === "boolean" && args.throttleable != engine.throttleable) continue nextEngine;
		
		var branches = [];
		if (args.cluster) {
			branches = args.parts.branches.filter(function (branch) {
				return branch.sizeB >= engine.size;
			});
		}
		
		nextBranch: for (var c = -1, cl = (engine.radial ? 0 : branches.length); c < cl; ++c) {
			var branch = branches[c];
			var engineMultiplier = (branch || 0).multiplier || 1;
			
			stage.lfoEngines = [];
			stage.branches = [];
			stage.others = [];
			
			//add fuel ducts for asparagus staging
			if (stage.asparagus) stage.others.push(FUEL_DUCT);
			
			//add branch
			if (branch) stage.branches.push(branch);
			
			nextEngineCount: for (var ec = 1, ecl = (engine.radial ? args.maxSymmetry : 1); ec <= ecl; ++ec) {
				//add engine * branch multiplier
				for (var y = 0; y < engineMultiplier; ++y) {
					stage.lfoEngines.push(engine);
				}
				
				stage.lfoTanks = [];
				
				nextTank: for (var skippedTank, t = 0, tl = args.parts.lfoTanks.length; t < tl || skippedTank; ++t) {
					//if we are out of tanks, but skipped some, go back and try them
					if (t >= tl) {
						t = skippedTank - 1;  //gets incremented next time around
						skippedTank = undefined;
						stage.lfoTanks = [];
						continue nextTank;
					}
					
					var tank = args.parts.lfoTanks[t];
					
					if (args.tankDiametersEqual && !tank.radial) {
						if (branch && branch.sizeA !== tank.size) {
							//this tank will not work
							continue nextTank;
						} else if (!branch && !stage.lfoEngines[0].radial && ((tank.size < stage.lfoEngines[0].size && args.tankDiametersEqualEngineDiameter) || (tank.size > stage.lfoEngines[0].size && !args.tankDiametersGreaterThenEngineDiameter))) {
							//this tank will not work
							continue nextTank;
						} else if (stage.lfoTanks.length && stage.lfoTanks[0].size !== tank.size) {
							//come back to this tank later
							if (!skippedTank) skippedTank = t;
							continue nextTank;
						} else if (bestStackDecoupler && bestStackDecoupler.size !== tank.size) {
							var newDecouplerIndex = args.parts.stackDecouplers.map(pluck.bind(this, "size")).indexOf(tank.size);
							if (newDecouplerIndex > -1) {
								bestStackDecoupler = args.parts.stackDecouplers[newDecouplerIndex];
							}
						}
					}
					
					var diff = (stage.lfoTanks.length === 0 ? 8 : Math.ceil(args.parts.lfoTanks[t-1].mass_fuel / tank.mass_fuel));
					nextTankCount: for (var tc = 1; tc < diff; ++tc) {
						stage.lfoTanks.push(tank);
						stage.decouplers = [];
						
						nextStackCount: for (var sc = stackMultiplier; sc <= args.maxStacks; sc += stackMultiplier) {
							stage.multiplier = sc;
							
							if (engine.radial && stage.multiplier === 1) {
								//prevent a single radial engine on a single stack
								continue nextStackCount;
							}
							
							//add decouplers
							if (args.decoupling) {
								if (stage.multiplier === 1) {
									if (bestStackDecoupler) stage.decouplers = [ bestStackDecoupler ];
								} else {
									if (bestRadialDecoupler) {
										stage.decouplers = [ bestRadialDecoupler ];
									}
								}
							}
						
							if (args.maxPartCount !== Infinity && KSP.Stages.partCount(stage) > args.maxPartCount) {
								//too many parts, try something different
								if (sc === stackMultiplier) {
									continue nextBranch;
								} else {
									break;
								}
							}
							
							if (args.maxTanks !== Infinity && KSP.Stage.tankCount(stage) > args.maxTanks * stage.multiplier) {
								if (sc === stackMultiplier) {
									stage.lfoTanks.pop();
									continue nextTank;
								} else {
									break;
								}
							}
							
							if (args.maxMass !== Infinity && KSP.Stages.massStart(stage) > args.maxMass) {
								//parts are too heavy
								if (sc === stackMultiplier) {
									stage.lfoTanks.pop();
									continue nextTank;
								} else {
									break;
								}
							}
							
							var twr = KSP.Stages.twr(stage, args.atm, args.planet);
							var time = KSP.Stages.timeStage(stage, args.atm);
							
							if (twr < args.minTWR || time > args.maxTime) {
								if (KSP.Stages.deltaVStage(stage, args.atm) >= args.deltaV) {
									//last tank was too big
									if (sc === stackMultiplier) {
										stage.lfoTanks.pop();
										continue nextTank;
									} else {
										break;
									}
								} else {
									//engine is not a good fit
									continue nextEngineCount;
								}
							} else {
								var dV = KSP.Stages.deltaVStage(stage, args.atm);
								if (twr <= args.maxTWR && time >= args.minTime && dV >= args.deltaV) {
									stage.metric = getMetric(stage, args);
									
									if (!bestStage || stage.metric < bestStage.metric) {
										bestStage = {
											next : stage.next,
											multiplier : stage.multiplier,
											payload : stage.payload,
											others : stage.others.slice(),
											lfoEngines : stage.lfoEngines.slice(),
											lfoTanks : stage.lfoTanks.slice(),
											boosters : stage.boosters.slice(),
											decouplers : stage.decouplers.slice(),
											branches : stage.branches.slice(),
											parallel : stage.parallel,
											asparagus : stage.asparagus,
											optimization : stage.optimization,
											metric : stage.metric,
											deltaV : dV
										};
									}
									
									if (sc === stackMultiplier) {
										stage.lfoTanks.pop();
										continue nextTank;
									} else {
										break;
									}
								}
							}
						}
					}
				}
			}
		}
	}
	
	//
	//Boosters
	//
	
	stage = {
		next : args.next,
		multiplier : 0,
		payload : 0,
		others : [],
		lfoEngines : [],
		lfoTanks : [],
		boosters : [],
		decouplers : [],
		branches : [],
		parallel : false,  //not yet supported
		asparagus : false,  //boosters can't share fuel
		optimization : args.optimization,
		metric : Infinity,
		deltaV : 0
	};
	
	bestStackDecoupler = args.parts.stackDecouplers[0];
	bestRadialDecoupler = args.parts.radialDecouplers[0];
	
	nextBooster: for (var b = 0, bl = args.parts.boosters.length; b < bl; ++b) {
		var booster = args.parts.boosters[b];
		
		if (typeof args.gimbal === "boolean" && args.gimbal != (booster.gimbal > 0)) continue nextBooster;
		if (typeof args.throttleable === "boolean" && typeof booster.throttleable === "boolean" && args.throttleable != booster.throttleable) continue nextBooster;
		
		if (args.tankDiametersEqual && !booster.radial && bestStackDecoupler && bestStackDecoupler.size !== booster.size) {
			var newDecouplerIndex = args.parts.stackDecouplers.map(pluck.bind(this, "size")).indexOf(booster.size);
			if (newDecouplerIndex > -1) {
				bestStackDecoupler = args.parts.stackDecouplers[newDecouplerIndex];
			}
		}
		
		stage.boosters = [ booster ];
		
		nextStackCount: for (var sc = stackMultiplier; sc <= args.maxStacks; sc += stackMultiplier) {
			stage.multiplier = sc;
		
			if (booster.radial && stage.multiplier === 1) {
				//prevents a single radial booster on a single stack
				continue nextStackCount;
			}
			
			//add decouplers
			if (args.decoupling) {
				if (stage.multiplier === 1) {
					if (bestStackDecoupler) stage.decouplers = [ bestStackDecoupler ];
				} else {
					if (bestRadialDecoupler) {
						stage.decouplers = [ bestRadialDecoupler ];
					}
				}
			}
		
			if (args.maxPartCount !== Infinity && KSP.Stages.partCount(stage) > args.maxPartCount) {
				//too many parts, try something different
				if (sc === stackMultiplier) {
					continue nextBooster;
				} else {
					break;
				}
			}
			
			if (args.maxMass !== Infinity && KSP.Stages.massStart(stage) > args.maxMass) {
				//parts are too heavy
				if (sc === stackMultiplier) {
					stage.lfoTanks.pop();
					continue nextBooster;
				} else {
					break;
				}
			}
			
			var twr = KSP.Stages.twr(stage, args.atm, args.planet);
			var time = KSP.Stages.timeStage(stage, args.atm);
			if (twr > args.maxTWR || time < args.minTime || time > args.maxTime) {
				continue nextBooster;
			} else {
				var dV = KSP.Stages.deltaVStage(stage, args.atm);
				if (twr >= args.minTWR && dV >= args.deltaV) {
					stage.metric = getMetric(stage, args);
					
					if (!bestStage || stage.metric < bestStage.metric) {
						bestStage = {
							next : stage.next,
							multiplier : stage.multiplier,
							payload : stage.payload,
							others : stage.others.slice(),
							lfoEngines : stage.lfoEngines.slice(),
							lfoTanks : stage.lfoTanks.slice(),
							boosters : stage.boosters.slice(),
							decouplers : stage.decouplers.slice(),
							branches : stage.branches.slice(),
							parallel : stage.parallel,
							asparagus : stage.asparagus,
							optimization : stage.optimization,
							metric : stage.metric,
							deltaV : dV
						};
					}
					
					continue nextBooster;
				}
			}
		}
	}
	
	
	//remove empty engines
	if (bestStage && bestStage.lfoEngines[0] === NO_ENGINE) {
		bestStage.lfoEngines = [];
	}
	
	return bestStage;
}

function findRandomOptimalStaging(args) {
	fixArgs(args);
	var randomSolution = null;
	
	if (args.maxStages === 1) {
		randomSolution = findOptimalStage(args);
	} else {
		var firstArgs = Object.create(args);
		firstArgs.deltaV = Math.round(args.deltaV * Math.random());
		var firstStage = findOptimalStage(firstArgs);
		
		if (firstStage) {
			var secondArgs = Object.create(args);
			secondArgs.next = firstStage;
			secondArgs.deltaV = args.deltaV - firstStage.deltaV;
			secondArgs.maxStacks = args.stagesMaxStacks;
			secondArgs.parallel = args.stagesParallel;
			secondArgs.asparagus = args.stagesAsparagus;
			secondArgs.throttleable = args.stagesThrottleable;
			secondArgs.decoupling = true;
			secondArgs.maxStages = args.maxStages - 1;
			var secondStage = findOptimalStage(secondArgs);
			
			var nextStage = null;
			if (secondArgs.maxStages > 1) {
				nextStage = findRandomOptimalStaging(secondArgs);
			}
			
			if (secondStage && (!nextStage || secondStage.metric < nextStage.metric)) {
				randomSolution = secondStage;
			} else if (nextStage) {
				randomSolution = nextStage;
			}
		}
	}
	
	return randomSolution;
}

function searchForOptimalStaging(args, callback) {
	var timerId;
	var cancelled = false;
	var routine = function routine() {
		if (!cancelled) {
			var staging = findRandomOptimalStaging(args);
			if (staging) staging.id = args.id;
			if (args.maxStages > 1) {
				timerId = setTimeout(routine, (args.interval || 10));
			}
			callback(staging);
		}
	}
	timerId = setTimeout(routine, (args.interval || 10));
	
	return function cancel() {
		cancelled = true;
		clearTimeout(timerId);
	}
}


//WebWorker Job Runner
if (typeof document === "undefined") {
	var global = this;
	var cancelGlobalSearcher = function () {};
	
	addEventListener('message', function onmessage(evt) {
		cancelGlobalSearcher();
		var args = evt.data;
		if (!args.cancel) {
			cancelGlobalSearcher = searchForOptimalStaging(args, postMessage);
		}
	});
}
