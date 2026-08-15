import { AcApTemplatePlugin } from './AcApTemplatePlugin'

/** Factory used by the lazy plugin loader. */
export function createTemplatePlugin() {
  return new AcApTemplatePlugin()
}
