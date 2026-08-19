import { AcGeBox2d, AcGePoint2d } from '@mlightcad/data-model'

import { AcTrRenderer } from '../src/renderer'
import { AcTrBaseView } from '../src/viewport/AcTrBaseView'

/**
 * Framing a box with no size.
 *
 * Zooming to a point-sized box used to divide the frustum by `Number.EPSILON`
 * and leave the camera at a zoom near 5e18: a blank canvas with the drawing
 * still in it, eighteen orders of magnitude away. It surfaced when the
 * assistant ran a template and zoomed to extents in the same turn — the fit
 * landed on an empty scene box and the viewer went black and stayed black.
 *
 * The flat-along-one-axis cases below were already survivable, because
 * `Math.min` discarded the exploded term. They are here so that stays true by
 * intent rather than by luck.
 */
class TestView extends AcTrBaseView {}

function createMockRenderer(): AcTrRenderer {
  return {
    domElement: {} as HTMLCanvasElement,
    render: jest.fn()
  } as unknown as AcTrRenderer
}

const boxOf = (x1: number, y1: number, x2: number, y2: number) =>
  new AcGeBox2d(new AcGePoint2d(x1, y1), new AcGePoint2d(x2, y2))

/** World units visible across the canvas at the camera's current zoom. */
function visibleSize(view: TestView) {
  const camera = view.internalCamera
  return {
    width: (camera.right - camera.left) / camera.zoom,
    height: (camera.top - camera.bottom) / camera.zoom
  }
}

describe('zoomTo trên hộp bẹt', () => {
  it('đường nằm ngang: bề rộng quyết định mức phóng, không phải vô cực', () => {
    const view = new TestView(createMockRenderer(), 1000, 500)
    view.zoomTo(boxOf(0, 0, 100, 0))

    expect(Number.isFinite(view.internalCamera.zoom)).toBe(true)
    // Bề rộng 100 cộng lề 10% vừa khít khung nhìn.
    expect(visibleSize(view).width).toBeCloseTo(110, 5)
    expect(view.internalCamera.position.x).toBeCloseTo(50)
    expect(view.internalCamera.position.y).toBeCloseTo(0)
  })

  it('đường thẳng đứng cũng vậy', () => {
    const view = new TestView(createMockRenderer(), 1000, 500)
    view.zoomTo(boxOf(0, 0, 0, 50))

    expect(Number.isFinite(view.internalCamera.zoom)).toBe(true)
    expect(visibleSize(view).height).toBeCloseTo(55, 5)
  })

  it('hộp là một điểm: giữ nguyên mức phóng, chỉ dời tâm', () => {
    const view = new TestView(createMockRenderer(), 1000, 500)
    const zoom = view.internalCamera.zoom
    view.zoomTo(boxOf(5, 7, 5, 7))

    expect(view.internalCamera.zoom).toBe(zoom)
    expect(view.internalCamera.position.x).toBeCloseTo(5)
    expect(view.internalCamera.position.y).toBeCloseTo(7)
  })

  it('hộp bình thường vẫn khớp theo chiều chật hơn', () => {
    const view = new TestView(createMockRenderer(), 1000, 500)
    view.zoomTo(boxOf(0, 0, 100, 100))

    // Khung 1000×500 rộng gấp đôi cao, nên hộp vuông bị chiều cao chặn trước.
    expect(visibleSize(view).height).toBeCloseTo(110, 5)
    expect(visibleSize(view).width).toBeCloseTo(220, 5)
  })
})
