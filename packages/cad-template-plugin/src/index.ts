// Re-exported so the host UI can type its form against the template contract
// without taking a direct dependency on the SDK.
export type {
  AcTpParamSpec,
  AcTpParamValues,
  AcTpTemplate,
  AcTpTemplateMeta
} from '@mlightcad/cad-template-sdk'

export * from './AcApTemplatePlugin'
export * from './command/AcApTemplateCmd'
export * from './createTemplatePlugin'
export * from './dialogIntegration'
export * from './assembly'
export * from './btkl'
export * from './btkl/tools'
export * from './editRun'
export * from './remoteTemplates'
export * from './runIdentity'
export * from './runTemplate'
export * from './semanticTools'
export * from './skillLibrary'
export * from './tagFromLayers'
export * from './templatePreview'
export * from './templateTools'
export * from './templateValues'
export * from './uploadTemplate'
export * from './templateRegistry'
export * from './dossier/model'
export * from './dossier/dimSymbols'
export * from './dossier/scene'
export * from './dossier/export'
export * from './dossier/tools'
export type { RoadBand, RoadLayer, RoadModel } from './road/model'
export {
  buildRoadModel,
  parseRoadLayers,
  ROAD_DEFAULT_LAYERS,
  ROAD_ID,
  ROAD_PARAMS,
  ROAD_VERSION,
  roadCrossFallRange,
  roadDefaults
} from './road/model'
export type { RoadPrimitive, RoadScene } from './road/scene'
export { buildRoadScene, ROAD_SCALES, roadTextBox } from './road/scene'
export { roadSectionTemplate } from './road/template'
export { ROAD_TOOLS, runRoadTool } from './road/tools'
