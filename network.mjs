export const nodes = [
  { id:'sea', name:'Seattle', x:99, y:68, supply:96, demand:21, priority:3 },
  { id:'pdx', name:'Portland', x:76, y:139, supply:0, demand:32, priority:2 },
  { id:'sfo', name:'Bay Area', x:66, y:276, supply:58, demand:32, priority:4 },
  { id:'lax', name:'Los Angeles', x:119, y:359, supply:0, demand:49, priority:3 },
  { id:'slc', name:'Salt Lake City', x:211, y:225, supply:0, demand:24, priority:2 },
  { id:'den', name:'Denver', x:310, y:245, supply:110, demand:25, priority:3 },
  { id:'phx', name:'Phoenix', x:218, y:346, supply:0, demand:29, priority:2 },
  { id:'dfw', name:'Dallas', x:424, y:357, supply:95, demand:38, priority:3 },
  { id:'msp', name:'Minneapolis', x:461, y:107, supply:0, demand:23, priority:2 },
  { id:'chi', name:'Chicago', x:557, y:153, supply:88, demand:35, priority:4 },
  { id:'stl', name:'St. Louis', x:499, y:236, supply:0, demand:25, priority:2 },
  { id:'atl', name:'Atlanta', x:625, y:321, supply:0, demand:38, priority:3 },
  { id:'mia', name:'Miami', x:703, y:411, supply:0, demand:34, priority:2 },
  { id:'iad', name:'Virginia', x:725, y:220, supply:115, demand:32, priority:4 },
  { id:'nyc', name:'New York', x:792, y:148, supply:0, demand:49, priority:4 },
  { id:'bos', name:'Boston', x:826, y:83, supply:0, demand:31, priority:3 },
];

const specifications = [
  ['sea','pdx',52,4,2],['sea','slc',49,13,3],['sea','msp',32,25,4],
  ['pdx','sfo',37,9,2],['pdx','slc',29,11,3],['sfo','lax',46,8,2],
  ['sfo','slc',28,13,4],['lax','phx',47,9,2],['lax','dfw',25,20,4],
  ['slc','den',60,8,2],['slc','phx',29,9,2],['phx','den',30,13,3],
  ['phx','dfw',40,16,3],['den','dfw',55,14,2],['den','msp',38,16,3],
  ['den','stl',42,14,2],['dfw','stl',49,11,2],['dfw','atl',55,14,3],
  ['dfw','mia',36,20,4],['msp','chi',48,9,2],['msp','stl',33,12,2],
  ['chi','stl',48,8,2],['chi','iad',64,15,3],['chi','nyc',39,17,4],
  ['stl','atl',38,12,3],['atl','mia',51,11,2],['atl','iad',54,12,2],
  ['iad','nyc',73,8,3],['iad','mia',27,18,4],['nyc','bos',55,6,2],
  ['iad','bos',29,13,3],
];

export const links = specifications.map(([a,b,capacity,latency,hours]) => ({
  id:a+'-'+b,a,b,capacity,latency,hours,
}));

export const scenarios = {
  'Atlantic cuts':['iad-nyc','nyc-bos','iad-bos','chi-nyc','atl-iad','dfw-atl'],
  'Western cascade':['sea-pdx','pdx-sfo','sea-slc','sfo-lax','slc-den','lax-phx','sea-msp'],
  'Central corridor':['den-dfw','den-stl','dfw-stl','chi-stl','msp-chi','stl-atl','chi-iad'],
  'Intact network':[],
};
