import { AcDbDatabase } from '@mlightcad/data-model'

import { eventBus } from '../src/editor/global/eventBus'
import {
  acapNotifyUndoStackChanged,
  acapRunDatabaseEdit,
  acapRunGroupedEdit
} from '../src/util/AcApDatabaseEdit'

jest.mock('../src/editor/global/eventBus', () => ({
  eventBus: {
    emit: jest.fn()
  }
}))

function createDatabase(options?: { isRecording?: boolean }) {
  const db = new AcDbDatabase()

  db.transactionManager.isRecording = jest.fn(
    () => options?.isRecording ?? false
  ) as never
  db.transactionManager.runUndoable = jest.fn(
    (_label: string, fn: () => void) => {
      fn()
    }
  ) as never

  return db
}

/**
 * Database stubbed at the transaction-manager level, which is the surface
 * `acapRunGroupedEdit` drives directly (it cannot go through the synchronous
 * `runUndoable` helper).
 */
function createGroupedDatabase(options?: { isRecording?: boolean }) {
  const db = new AcDbDatabase()
  const tm = db.transactionManager

  tm.isRecording = jest.fn(() => options?.isRecording ?? false) as never
  tm.startUndoMark = jest.fn() as never
  tm.endUndoMark = jest.fn() as never
  tm.cancelUndoMark = jest.fn() as never
  tm.startTransaction = jest.fn() as never
  tm.commitTransaction = jest.fn() as never
  tm.abortTransaction = jest.fn() as never
  tm.hasTransaction = jest.fn(() => true) as never

  return db
}

describe('AcApDatabaseEdit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('acapNotifyUndoStackChanged emits undo-stack-changed', () => {
    acapNotifyUndoStackChanged()
    expect(eventBus.emit).toHaveBeenCalledWith('undo-stack-changed', {})
  })

  test('acapRunDatabaseEdit skips nested undo marks while recording', () => {
    const db = createDatabase({ isRecording: true })
    const fn = jest.fn()

    acapRunDatabaseEdit(db, 'Color', fn)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(db.transactionManager.runUndoable).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  test('acapRunDatabaseEdit creates an undo mark and notifies listeners', () => {
    const db = createDatabase({ isRecording: false })
    const fn = jest.fn()

    acapRunDatabaseEdit(db, 'Color', fn)

    expect(db.transactionManager.runUndoable).toHaveBeenCalledWith(
      'Color',
      expect.any(Function)
    )
    expect(fn).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith('undo-stack-changed', {})
  })

  describe('acapRunGroupedEdit', () => {
    test('wraps a whole asynchronous sequence in exactly one undo mark', async () => {
      const db = createGroupedDatabase()
      const tm = db.transactionManager
      const order: string[] = []

      await acapRunGroupedEdit(db, 'Thêm lan can', async () => {
        order.push('edit-1')
        await Promise.resolve()
        order.push('edit-2')
        await Promise.resolve()
        order.push('edit-3')
      })

      expect(order).toEqual(['edit-1', 'edit-2', 'edit-3'])
      expect(tm.startUndoMark).toHaveBeenCalledTimes(1)
      expect(tm.startUndoMark).toHaveBeenCalledWith('Thêm lan can')
      expect(tm.endUndoMark).toHaveBeenCalledTimes(1)
      expect(tm.cancelUndoMark).not.toHaveBeenCalled()
      expect(tm.commitTransaction).toHaveBeenCalledTimes(1)
      expect(eventBus.emit).toHaveBeenCalledWith('undo-stack-changed', {})
    })

    test('nested calls join the enclosing mark instead of opening their own', async () => {
      const db = createGroupedDatabase({ isRecording: true })
      const tm = db.transactionManager
      const fn = jest.fn()

      await acapRunGroupedEdit(db, 'Nested', fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(tm.startUndoMark).not.toHaveBeenCalled()
      expect(tm.endUndoMark).not.toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalled()
    })

    test('a failure part-way through rolls back and leaves no mark behind', async () => {
      const db = createGroupedDatabase()
      const tm = db.transactionManager
      const boom = new Error('template hỏng giữa chừng')

      await expect(
        acapRunGroupedEdit(db, 'Sinh bản vẽ', async () => {
          await Promise.resolve()
          throw boom
        })
      ).rejects.toThrow(boom)

      expect(tm.abortTransaction).toHaveBeenCalledTimes(1)
      expect(tm.cancelUndoMark).toHaveBeenCalledTimes(1)
      expect(tm.commitTransaction).not.toHaveBeenCalled()
      expect(tm.endUndoMark).not.toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalled()
    })

    test('accepts a synchronous callback too', async () => {
      const db = createGroupedDatabase()
      const fn = jest.fn()

      await acapRunGroupedEdit(db, 'Đồng bộ', fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(db.transactionManager.endUndoMark).toHaveBeenCalledTimes(1)
    })
  })
})
