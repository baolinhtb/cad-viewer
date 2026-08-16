import { AcDbDatabase, AcDbLine } from '@mlightcad/data-model'

import { eventBus } from '../src/editor/global/eventBus'
import {
  acapNotifyUndoStackChanged,
  acapRunDatabaseEdit,
  acapRunGroupedEdit,
  acapRunMarkedEdits
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

  /**
   * The stubbed cases above prove the helper drives the transaction manager in
   * the right order; they cannot prove the manager actually merges the marks.
   * That is the whole promise — one AI turn, one `Ctrl+Z` — so it is checked
   * against a real database.
   */
  describe('acapRunGroupedEdit against a real database', () => {
    function createRealDatabase() {
      const db = new AcDbDatabase()
      db.createDefaultData()
      return db
    }

    function entityCount(db: AcDbDatabase) {
      return [...db.tables.blockTable.modelSpace.newIterator()].length
    }

    test('nested edits collapse into one undo record and one notification', async () => {
      const db = createRealDatabase()

      await acapRunGroupedEdit(db, 'vẽ lan can hai bên', async () => {
        for (let stroke = 0; stroke < 12; stroke += 1) {
          // Awaiting between edits is what the agent turn does; the mark has
          // to span the waits.
          await Promise.resolve()
          acapRunDatabaseEdit(db, `Agent: draw_line ${stroke}`, () => {
            db.tables.blockTable.modelSpace.appendEntity(
              new AcDbLine(
                { x: 0, y: stroke, z: 0 },
                { x: 100, y: stroke, z: 0 }
              )
            )
          })
        }
      })

      expect(entityCount(db)).toBe(12)
      // Autosave listens to this event; twelve strokes must not mean twelve
      // uploads of half-finished states.
      expect(eventBus.emit).toHaveBeenCalledTimes(1)
      expect(eventBus.emit).toHaveBeenCalledWith('undo-stack-changed', {})

      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
      expect(db.transactionManager.canUndo()).toBe(false)
    })

    test('a group that changes nothing leaves no record', async () => {
      const db = createRealDatabase()

      await acapRunGroupedEdit(db, 'lan can bên phải ở đâu', async () => {
        await Promise.resolve()
        entityCount(db)
      })

      expect(db.transactionManager.canUndo()).toBe(false)
    })

    test('hand edits before and after an AI turn stay on the same history', async () => {
      const db = createRealDatabase()
      const line = (y: number) =>
        new AcDbLine({ x: 0, y, z: 0 }, { x: 100, y, z: 0 })

      acapRunDatabaseEdit(db, 'LINE', () => {
        db.tables.blockTable.modelSpace.appendEntity(line(0))
      })
      await acapRunGroupedEdit(db, 'vẽ dầm', async () => {
        await Promise.resolve()
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(1))
        })
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(2))
        })
      })
      acapRunDatabaseEdit(db, 'LINE', () => {
        db.tables.blockTable.modelSpace.appendEntity(line(3))
      })

      expect(entityCount(db)).toBe(4)
      // Three marks, one line of history: the AI does not get a stack of its
      // own that the hand commands cannot walk back through.
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(3)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(1)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
      expect(db.transactionManager.canUndo()).toBe(false)
    })
  })

  /**
   * The mark-only group exists for one reason the grouped one cannot serve: a
   * turn that runs for tens of seconds has to show its work while it runs.
   *
   * `appendEntity` notifies only when the manager is not recording, and the
   * batched notification comes from the outermost commit — so a held-open
   * transaction keeps every stroke off the canvas, and out of the renderer
   * scene the verification screenshot is taken from, until the turn ends.
   * These cases pin down that the geometry arrives as it is drawn *and* that
   * the history still shows one entry.
   */
  describe('acapRunMarkedEdits against a real database', () => {
    function createRealDatabase() {
      const db = new AcDbDatabase()
      db.createDefaultData()
      return db
    }

    function entityCount(db: AcDbDatabase) {
      return [...db.tables.blockTable.modelSpace.newIterator()].length
    }

    function line(y: number) {
      return new AcDbLine({ x: 0, y, z: 0 }, { x: 100, y, z: 0 })
    }

    /** Counts entity-append notifications that arrive while `fn` runs. */
    function countAppendsDuring(db: AcDbDatabase) {
      let appends = 0
      const listener = () => {
        appends += 1
      }
      db.events.entityAppended.addEventListener(listener)
      return {
        get value() {
          return appends
        },
        stop: () => db.events.entityAppended.removeEventListener(listener)
      }
    }

    test('every edit reaches the canvas while the turn is still running', async () => {
      const db = createRealDatabase()
      const appends = countAppendsDuring(db)
      let seenMidTurn = -1

      await acapRunMarkedEdits(db, 'vẽ lan can hai bên', async () => {
        for (let stroke = 0; stroke < 12; stroke += 1) {
          await Promise.resolve()
          acapRunDatabaseEdit(db, `Agent: draw_line ${stroke}`, () => {
            db.tables.blockTable.modelSpace.appendEntity(line(stroke))
          })
        }
        seenMidTurn = appends.value
      })
      appends.stop()

      // The point of the whole helper: the drawing was visible before the
      // turn closed, not after.
      expect(seenMidTurn).toBe(12)
      expect(entityCount(db)).toBe(12)
    })

    test('the same twelve edits still leave one record and one notification', async () => {
      const db = createRealDatabase()

      await acapRunMarkedEdits(db, 'vẽ lan can hai bên', async () => {
        for (let stroke = 0; stroke < 12; stroke += 1) {
          await Promise.resolve()
          acapRunDatabaseEdit(db, `Agent: draw_line ${stroke}`, () => {
            db.tables.blockTable.modelSpace.appendEntity(line(stroke))
          })
        }
      })

      // Autosave listens to this event; twelve strokes must not mean twelve
      // uploads of half-finished states.
      expect(eventBus.emit).toHaveBeenCalledTimes(1)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
      expect(db.transactionManager.canUndo()).toBe(false)
    })

    test('a held-open transaction shows nothing until it closes', async () => {
      const db = createRealDatabase()
      const appends = countAppendsDuring(db)
      let seenMidTurn = -1

      await acapRunGroupedEdit(db, 'vẽ lan can hai bên', async () => {
        for (let stroke = 0; stroke < 12; stroke += 1) {
          await Promise.resolve()
          acapRunDatabaseEdit(db, `Agent: draw_line ${stroke}`, () => {
            db.tables.blockTable.modelSpace.appendEntity(line(stroke))
          })
        }
        seenMidTurn = appends.value
      })
      appends.stop()

      // Recorded so the difference between the two helpers stays a fact of the
      // suite rather than a claim in a comment.
      expect(seenMidTurn).toBe(0)
    })

    test('a group that changes nothing leaves no record and says nothing', async () => {
      const db = createRealDatabase()

      await acapRunMarkedEdits(db, 'lan can bên phải ở đâu', async () => {
        await Promise.resolve()
        entityCount(db)
      })

      expect(db.transactionManager.canUndo()).toBe(false)
      expect(eventBus.emit).not.toHaveBeenCalled()
    })

    test('a throw keeps what was drawn, gathered under one mark', async () => {
      const db = createRealDatabase()
      const boom = new Error('tool call thứ ba hỏng')

      await expect(
        acapRunMarkedEdits(db, 'vẽ trụ cầu', async () => {
          acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
            db.tables.blockTable.modelSpace.appendEntity(line(0))
          })
          await Promise.resolve()
          acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
            db.tables.blockTable.modelSpace.appendEntity(line(1))
          })
          throw boom
        })
      ).rejects.toThrow(boom)

      // Not unwound automatically — see the helper's doc comment. What it did
      // draw stays, and one Ctrl+Z removes all of it.
      expect(entityCount(db)).toBe(2)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
    })

    test('a failing turn never touches a record it did not create', async () => {
      const db = createRealDatabase()
      const tm = db.transactionManager

      acapRunDatabaseEdit(db, 'LINE', () => {
        db.tables.blockTable.modelSpace.appendEntity(line(0))
      })

      await expect(
        acapRunMarkedEdits(db, 'vẽ trụ cầu', async () => {
          // A hand command running mid-turn opens a mark of its own, exactly
          // as `AcEdCommand.trigger` does, and it takes the changes into that
          // mark. An earlier build inferred "something committed" from the
          // database's change events and undid on failure — which popped this
          // record and deleted the user's line. Measured, hence this test.
          tm.startUndoMark('LINE giữa lượt')
          tm.startTransaction()
          db.tables.blockTable.modelSpace.appendEntity(line(1))
          tm.commitTransaction()
          tm.endUndoMark()
          throw new Error('mô hình từ chối')
        })
      ).rejects.toThrow('mô hình từ chối')

      expect(entityCount(db)).toBe(2)
    })

    test('an edit whose body throws aborts only itself', async () => {
      const db = createRealDatabase()
      const tm = db.transactionManager

      await acapRunMarkedEdits(db, 'vẽ trụ cầu', async () => {
        // Every agent tool catches its own failure and reports it to the
        // model, so the turn carries on after one.
        expect(() =>
          acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
            throw new Error('toạ độ sai')
          })
        ).toThrow('toạ độ sai')
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(0))
        })
      })

      // No transaction left dangling for later edits to fall into, and the
      // stroke that did succeed is undoable.
      expect(tm.hasTransaction()).toBe(false)
      expect(entityCount(db)).toBe(1)
      expect(eventBus.emit).toHaveBeenCalledTimes(1)
      expect(tm.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
    })

    test('a turn whose only edit dispatches no entity event is still announced', async () => {
      const db = createRealDatabase()

      await acapRunMarkedEdits(db, 'đặt layer hiện hành', async () => {
        acapRunDatabaseEdit(db, 'CLAYER', () => {
          db.clayer = db.tables.layerTable.getAt('0')!.objectId
        })
      })

      // `db.clayer` is a sysvar: no entityAppended, no layerModified. Reading
      // the change events to decide would leave this record unannounced, so
      // the Undo button would go stale and autosave would skip the turn.
      expect(db.transactionManager.canUndo()).toBe(true)
      expect(eventBus.emit).toHaveBeenCalledTimes(1)
    })

    test('an erase-only turn is announced once and undoes as one', async () => {
      const db = createRealDatabase()
      acapRunDatabaseEdit(db, 'LINE', () => {
        db.tables.blockTable.modelSpace.appendEntity(line(0))
        db.tables.blockTable.modelSpace.appendEntity(line(1))
      })
      ;(eventBus.emit as jest.Mock).mockClear()

      await acapRunMarkedEdits(db, 'xoá hai nét', async () => {
        for (const entity of [...db.tables.blockTable.modelSpace.newIterator()])
          acapRunDatabaseEdit(db, 'Agent: delete_entities', () => {
            entity.erase()
          })
      })

      expect(eventBus.emit).toHaveBeenCalledTimes(1)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(2)
    })

    test('a template run inside a turn joins the turn mark', async () => {
      const db = createRealDatabase()

      await acapRunMarkedEdits(db, 'vẽ cầu', async () => {
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(0))
        })
        // `runTemplate` reaches for the grouped helper; a turn awaiting the
        // model is long enough for a template run to start inside it.
        await acapRunGroupedEdit(db, 'Sinh từ template', async () => {
          acapRunDatabaseEdit(db, 'template', () => {
            db.tables.blockTable.modelSpace.appendEntity(line(1))
          })
        })
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(2))
        })
      })

      expect(entityCount(db)).toBe(3)
      // One record, not a history split around the template's own mark.
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
      expect(db.transactionManager.canUndo()).toBe(false)
    })

    test('a nested marked group joins rather than opening a second mark', async () => {
      const db = createRealDatabase()

      await acapRunMarkedEdits(db, 'lượt ngoài', async () => {
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(0))
        })
        await acapRunMarkedEdits(db, 'lượt trong', async () => {
          acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
            db.tables.blockTable.modelSpace.appendEntity(line(1))
          })
        })
      })

      expect(eventBus.emit).toHaveBeenCalledTimes(1)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
      expect(db.transactionManager.canUndo()).toBe(false)
    })

    test('a close that fails does not hide the failure that caused it', async () => {
      const db = createRealDatabase()
      const boom = new Error('tool call thứ ba hỏng')
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
      db.transactionManager.endUndoMark = jest.fn(() => {
        throw new Error('No active undo mark to end.')
      }) as never

      try {
        await expect(
          acapRunMarkedEdits(db, 'vẽ trụ cầu', async () => {
            throw boom
          })
        ).rejects.toThrow(boom)
        expect(logged).toHaveBeenCalled()
      } finally {
        // Restored in `finally` so a failing assertion does not silence
        // console output for every test that runs after this one.
        logged.mockRestore()
      }
    })

    test('a close that fails still lets the next turn open its own mark', async () => {
      const db = createRealDatabase()
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
      const realEnd = db.transactionManager.endUndoMark.bind(
        db.transactionManager
      )
      db.transactionManager.endUndoMark = jest.fn(() => {
        throw new Error('No active undo mark to end.')
      }) as never

      try {
        await expect(
          acapRunMarkedEdits(db, 'lượt hỏng', async () => {
            throw new Error('hỏng')
          })
        ).rejects.toThrow('hỏng')

        // A broken unwind must not strand the database inside a group, or
        // every later edit in the session runs mark-less and unannounced.
        db.transactionManager.endUndoMark = realEnd as never
        await acapRunMarkedEdits(db, 'lượt sau', async () => {
          acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
            db.tables.blockTable.modelSpace.appendEntity(line(0))
          })
        })
        expect(db.transactionManager.canUndo()).toBe(true)
      } finally {
        logged.mockRestore()
      }
    })

    test('hand edits before and after a turn stay on the same history', async () => {
      const db = createRealDatabase()

      acapRunDatabaseEdit(db, 'LINE', () => {
        db.tables.blockTable.modelSpace.appendEntity(line(0))
      })
      await acapRunMarkedEdits(db, 'vẽ dầm', async () => {
        await Promise.resolve()
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(1))
        })
        acapRunDatabaseEdit(db, 'Agent: draw_line', () => {
          db.tables.blockTable.modelSpace.appendEntity(line(2))
        })
      })
      acapRunDatabaseEdit(db, 'LINE', () => {
        db.tables.blockTable.modelSpace.appendEntity(line(3))
      })

      expect(entityCount(db)).toBe(4)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(3)
      // The turn's two strokes walk back together, in one step.
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(1)
      expect(db.transactionManager.undo()).toBe(true)
      expect(entityCount(db)).toBe(0)
      expect(db.transactionManager.canUndo()).toBe(false)
    })
  })
})
