import { AcApContext, AcApDocManager } from '../app'
import {
  acedAlert,
  AcEdCommand,
  AcEdOpenMode,
  AcEdPromptPointOptions,
  AcEdPromptStatus,
  AcEdPromptStringOptions
} from '../editor'

/**
 * Sets, names and restores the drawing's working coordinate system.
 *
 * A survey-based drawing puts its structure at coordinates like x = 311088;
 * every dimension the engineer works in is relative to a site datum instead.
 * Without this the only way to place anything is the absolute number, which is
 * unreadable and the easiest place there is to drop a digit.
 *
 * Options are typed rather than picked from a menu, matching how the other
 * commands in this build take input:
 *
 *   ucs          → pick a point; it becomes the origin
 *   ucs w        → back to world coordinates
 *   ucs s <tên>  → store the current system under a name
 *   ucs r <tên>  → make a stored system current
 *   ucs ?        → list what the drawing holds
 *
 * Named systems live in the drawing and survive a save. Which one is *current*
 * does not — the header variable AutoCAD keeps that in is not among the ones
 * this data model reads or writes, so there is nowhere in the file to put it.
 * Saying so here is better than a datum that silently reverts on reopen.
 */
export class AcApUcsCmd extends AcEdCommand {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Review
  }

  async execute(context: AcApContext) {
    const service = context.doc.ucsService

    const option = new AcEdPromptStringOptions(
      'UCS — nhập W (về gốc thế giới), S <tên> (lưu), R <tên> (gọi lại), ' +
        '? (liệt kê), hoặc Enter để chọn điểm gốc mới:'
    )
    option.allowEmpty = true
    const answer = await AcApDocManager.instance.editor.getString(option)
    if (answer.status !== AcEdPromptStatus.OK) return

    const raw = (answer.stringResult ?? '').trim()
    const [keyword, ...rest] = raw.split(/\s+/)
    const name = rest.join(' ').trim()

    switch (keyword.toLowerCase()) {
      case '':
        return this.pickOrigin(service)
      case 'w':
      case 'world':
        service.setWorld()
        acedAlert('Đã về hệ toạ độ thế giới.')
        return
      case 's':
      case 'save':
        if (!name) {
          acedAlert('Thiếu tên. Dùng: ucs s <tên>')
          return
        }
        if (!service.save(name)) {
          acedAlert(`Không lưu được mốc "${name}".`)
          return
        }
        acedAlert(
          `Đã lưu mốc "${name}" tại (${fmt(service.current.origin.x)}, ${fmt(service.current.origin.y)}).`
        )
        return
      case 'r':
      case 'restore':
        if (!name) {
          acedAlert('Thiếu tên. Dùng: ucs r <tên>')
          return
        }
        if (!service.restore(name)) {
          const co = service.list().map(u => u.name)
          acedAlert(
            co.length
              ? `Không có mốc "${name}". Đang có: ${co.join(', ')}.`
              : `Bản vẽ chưa lưu mốc nào.`
          )
          return
        }
        acedAlert(`Đang dùng mốc "${name}".`)
        return
      case '?':
      case 'list': {
        const co = service.list()
        acedAlert(
          co.length
            ? co
                .map(u => `${u.name}: (${fmt(u.origin.x)}, ${fmt(u.origin.y)})`)
                .join(' · ')
            : 'Bản vẽ chưa lưu mốc nào.'
        )
        return
      }
      default:
        acedAlert(`Không hiểu "${raw}". Dùng W, S <tên>, R <tên> hoặc ?`)
    }
  }

  /** Asks for a point and makes it the origin, keeping the axes unrotated. */
  private async pickOrigin(service: AcApContext['doc']['ucsService']) {
    const prompt = new AcEdPromptPointOptions('Chọn điểm gốc mới:')
    const picked = await AcApDocManager.instance.editor.getPoint(prompt)
    if (picked.status !== AcEdPromptStatus.OK || !picked.value) return
    service.setCurrent({
      origin: { x: picked.value.x, y: picked.value.y },
      rotation: 0
    })
    acedAlert(
      `Gốc mới tại (${fmt(picked.value.x)}, ${fmt(picked.value.y)}). ` +
        'Lưu lại bằng: ucs s <tên>'
    )
  }
}

/** Toạ độ bản vẽ hay rất lớn; bốn chữ số thập phân là thừa cho người đọc. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
