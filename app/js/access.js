// Presentation destinations only. Session identity and permissions come from the API.
const workspaces={
  admin:{page:'admin',title:'National Command Center'},
  inspector:{page:'admin',title:'Inspection Workspace'},
  analyst:{page:'admin',title:'Market Intelligence Workspace'},
  operator:{page:'operator',title:'Assigned Station Workspace'},
  citizen:{page:'activity',title:'Citizen Dashboard'},
};
export function workspaceFor(role){return Object.hasOwn(workspaces,role)?workspaces[role]:workspaces.citizen;}
