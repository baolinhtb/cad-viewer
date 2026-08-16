/**
 * Vietnamese prompts for interactive drawing commands.
 *
 * Keyword entries have three parts and only two of them are translated.
 * `global` is the name the parser always accepts, so it stays in English and
 * the single-letter aliases derived from it (C, R, E …) keep working exactly
 * as they do in AutoCAD. `display` and `local` are translated, which means an
 * engineer can type either "Tâm" or "Center" and get the same result — the
 * muscle memory of twenty years is not something a translation should break.
 */
export default {
  arc: {
    startPointOrCenter: 'Chọn điểm đầu của cung hoặc',
    secondPointOrOptions: 'Chọn điểm thứ hai của cung hoặc',
    secondPoint: 'Chọn điểm thứ hai của cung',
    startPoint: 'Chọn điểm đầu của cung',
    centerPoint: 'Chọn tâm của cung',
    endPoint: 'Chọn điểm cuối của cung',
    endPointOrOptions: 'Chọn điểm cuối của cung hoặc',
    centerPointOrOptions: 'Chọn tâm của cung',
    includedAngle: 'Nhập góc ở tâm',
    chordLength: 'Nhập chiều dài dây cung',
    tangentDirection: 'Chọn hướng tiếp tuyến tại điểm đầu của cung',
    radius: 'Nhập bán kính cung',
    keywords: {
      center: { display: 'Tâm(C)', local: 'Tâm', global: 'Center' },
      end: { display: 'Điểm cuối(E)', local: 'Điểm cuối', global: 'End' },
      angle: { display: 'Góc(A)', local: 'Góc', global: 'Angle' },
      chordLength: {
        display: 'Dây cung(L)',
        local: 'Dây cung',
        global: 'ChordLength'
      },
      direction: { display: 'Hướng(D)', local: 'Hướng', global: 'Direction' },
      radius: { display: 'Bán kính(R)', local: 'Bán kính', global: 'Radius' }
    },
    invalid: {
      threePoint:
        'Cung 3 điểm không hợp lệ: ba điểm thẳng hàng hoặc không dựng được cung.',
      center:
        'Tâm không hợp lệ: điểm đầu và điểm cuối phải nằm trên cùng một đường tròn.',
      angle: 'Góc không hợp lệ: góc ở tâm phải lớn hơn 0 và nhỏ hơn 360 độ.',
      chordLength:
        'Dây cung không hợp lệ: giá trị vượt phạm vi cho bán kính hiện tại.',
      direction:
        'Hướng không hợp lệ: không dựng được cung từ hướng tiếp tuyến này.',
      radius:
        'Bán kính không hợp lệ: bán kính này không nối được điểm đầu và điểm cuối.'
    }
  },
  circle: {
    center: 'Chọn tâm đường tròn',
    centerOrOptions: 'Chọn tâm đường tròn hoặc',
    radius: 'Nhập bán kính đường tròn',
    radiusOrDiameter: 'Nhập bán kính đường tròn hoặc',
    diameter: 'Nhập đường kính đường tròn',
    twoPointFirst: 'Chọn đầu thứ nhất của đường kính',
    twoPointSecond: 'Chọn đầu thứ hai của đường kính',
    threePointFirst: 'Chọn điểm thứ nhất trên đường tròn',
    threePointSecond: 'Chọn điểm thứ hai trên đường tròn',
    threePointThird: 'Chọn điểm thứ ba trên đường tròn',
    keywords: {
      threeP: { display: '3P(3P)', local: '3P', global: '3P' },
      twoP: { display: '2P(2P)', local: '2P', global: '2P' },
      diameter: {
        display: 'Đường kính(D)',
        local: 'Đường kính',
        global: 'Diameter'
      }
    }
  },
  copy: {
    basePointOrOptions: 'Chọn điểm chuẩn hoặc',
    displacementOrArray: 'Nhập vectơ dời hoặc',
    secondPointOrArray: 'Chọn điểm thứ hai hoặc',
    modePrompt: 'Chọn chế độ sao chép',
    arrayItemCount: 'Nhập số bản trong dãy, tính cả bản gốc',
    arraySecondPointOrFit: 'Chọn điểm thứ hai hoặc',
    arrayFitSecondPoint: 'Chọn điểm thứ hai',
    keywords: {
      displacement: {
        display: 'Vectơ dời(D)',
        local: 'Vectơ dời',
        global: 'Displacement'
      },
      mode: { display: 'Chế độ(O)', local: 'Chế độ', global: 'Mode' },
      multiple: {
        display: 'Nhiều bản(M)',
        local: 'Nhiều bản',
        global: 'Multiple'
      },
      single: { display: 'Một bản(S)', local: 'Một bản', global: 'Single' },
      array: { display: 'Dãy(A)', local: 'Dãy', global: 'Array' },
      fit: { display: 'Chia đều(F)', local: 'Chia đều', global: 'Fit' }
    }
  },
  dimlinear: {
    xLine1Point: 'Chọn gốc đường gióng thứ nhất',
    xLine2Point: 'Chọn gốc đường gióng thứ hai',
    dimLinePoint: 'Chọn vị trí đường kích thước'
  },
  ellipse: {
    axisEndpointOrOptions: 'Chọn đầu trục của elip hoặc',
    arcAxisEndpointOrCenter: 'Chọn đầu trục của cung elip hoặc',
    center: 'Chọn tâm elip',
    firstAxisEndpoint: 'Chọn đầu của trục',
    secondAxisEndpoint: 'Chọn đầu còn lại của trục',
    otherAxisOrRotation: 'Nhập khoảng cách tới trục kia hoặc',
    rotationAngle: 'Nhập góc xoay quanh trục lớn',
    arcStartAngle: 'Nhập góc đầu của cung elip',
    arcEndAngle: 'Nhập góc cuối của cung elip',
    keywords: {
      arc: { display: 'Cung(A)', local: 'Cung', global: 'Arc' },
      center: { display: 'Tâm(C)', local: 'Tâm', global: 'Center' },
      rotation: {
        display: 'Góc xoay(R)',
        local: 'Góc xoay',
        global: 'Rotation'
      }
    },
    invalid: {
      axis: 'Trục không hợp lệ: chiều dài trục phải lớn hơn 0.',
      otherAxis: 'Trục kia không hợp lệ: khoảng cách phải lớn hơn 0.',
      rotation: 'Góc xoay không hợp lệ: trục nhỏ tạo ra phải lớn hơn 0.'
    }
  },
  hatch: {
    prompt: 'Chọn đối tượng biên hoặc',
    pickPoint: 'Chọn điểm bên trong vùng (hoặc nhấn Enter để kết thúc)',
    select: 'Chọn đối tượng cần tô hatch',
    patternName: 'Nhập tên mẫu hatch',
    scale: 'Nhập tỉ lệ mẫu hatch',
    angle: 'Nhập góc mẫu hatch',
    style: 'Chọn kiểu hatch',
    associative: 'Chọn chế độ liên kết',
    invalidBoundary: 'Các đối tượng đang chọn không tạo thành biên kín.',
    keywords: {
      pick: {
        display: 'Chọn điểm(P)',
        local: 'Chọn điểm',
        global: 'PickPoints'
      },
      select: {
        display: 'Chọn đối tượng(S)',
        local: 'Chọn đối tượng',
        global: 'SelectObjects'
      },
      cancel: { display: 'Hủy(C)', local: 'Hủy', global: 'Cancel' },
      pattern: { display: 'Mẫu(P)', local: 'Mẫu', global: 'Pattern' },
      scale: { display: 'Tỉ lệ(S)', local: 'Tỉ lệ', global: 'Scale' },
      angle: { display: 'Góc(A)', local: 'Góc', global: 'Angle' },
      style: { display: 'Kiểu(T)', local: 'Kiểu', global: 'HatchStyle' },
      associative: {
        display: 'Liên kết(AS)',
        local: 'Liên kết',
        global: 'AssociativeMode'
      },
      normal: { display: 'Thường(N)', local: 'Thường', global: 'Normal' },
      outer: { display: 'Ngoài cùng(O)', local: 'Ngoài cùng', global: 'Outer' },
      ignore: { display: 'Bỏ qua(I)', local: 'Bỏ qua', global: 'Ignore' },
      yes: { display: 'Có(Y)', local: 'Có', global: 'Yes' },
      no: { display: 'Không(N)', local: 'Không', global: 'No' }
    }
  },
  hideobjects: {
    hidden: 'đối tượng đã ẩn',
    restored: 'đối tượng đã hiện lại',
    nothingToRestore: 'Không có đối tượng ẩn nào để hiện lại'
  },
  entout: {
    longSidePrompt:
      'Nhập kích thước cạnh dài của ảnh xem trước, tính bằng điểm ảnh',
    exported: 'ảnh xem trước đã xuất',
    skipped: 'đối tượng đã bỏ qua',
    failed: {
      'no-preview-root': 'Không dựng được hình xem trước cho phần đang chọn',
      'no-bounds': 'Không tính được phạm vi xem trước cho phần đang chọn',
      'capture-failed': 'Không dựng được ảnh xem trước của đối tượng',
      'download-failed': 'Đã dựng ảnh xem trước nhưng tải tệp PNG thất bại'
    }
  },
  layer: {
    main: 'Chọn tùy chọn',
    listSummary: 'Danh sách layer đã in ra console của trình duyệt',
    emptyInput: 'Chưa nhập tên layer nào.',
    newPrompt: 'Nhập tên cho layer mới',
    makePrompt: 'Nhập tên layer cần tạo và đặt hiện hành',
    setPrompt: 'Nhập tên layer cần đặt hiện hành',
    onPrompt: 'Nhập tên layer cần bật',
    offPrompt: 'Nhập tên layer cần tắt',
    freezePrompt: 'Nhập tên layer cần đóng băng',
    thawPrompt: 'Nhập tên layer cần rã đông',
    lockPrompt: 'Nhập tên layer cần khóa',
    unlockPrompt: 'Nhập tên layer cần mở khóa',
    colorLayerPrompt: 'Nhập tên layer cần đổi màu',
    colorValuePrompt:
      'Nhập màu (ACI 1-255, RGB dạng 255,0,0, hoặc tên màu CSS)',
    invalidColor: 'Giá trị màu không hợp lệ.',
    descriptionLayerPrompt: 'Nhập tên layer cần sửa mô tả',
    descriptionValuePrompt: 'Nhập mô tả mới cho layer',
    created: 'Số layer đã tạo',
    alreadyExists: 'Layer đã tồn tại',
    notFound: 'Không tìm thấy layer',
    cannotChangeCurrent: 'Không thể tắt hoặc đóng băng layer hiện hành.',
    keywords: {
      list: { display: '?(?)', local: '?', global: '?' },
      make: { display: 'Tạo và đặt(M)', local: 'Tạo và đặt', global: 'Make' },
      set: {
        display: 'Đặt hiện hành(S)',
        local: 'Đặt hiện hành',
        global: 'Set'
      },
      new: { display: 'Tạo mới(N)', local: 'Tạo mới', global: 'New' },
      on: { display: 'Bật(ON)', local: 'Bật', global: 'On' },
      off: { display: 'Tắt(OF)', local: 'Tắt', global: 'Off' },
      color: { display: 'Màu(C)', local: 'Màu', global: 'Color' },
      freeze: { display: 'Đóng băng(F)', local: 'Đóng băng', global: 'Freeze' },
      thaw: { display: 'Rã đông(T)', local: 'Rã đông', global: 'Thaw' },
      lock: { display: 'Khóa(L)', local: 'Khóa', global: 'Lock' },
      unlock: { display: 'Mở khóa(U)', local: 'Mở khóa', global: 'Unlock' },
      description: {
        display: 'Mô tả(D)',
        local: 'Mô tả',
        global: 'Description'
      }
    }
  },
  layon: {
    alreadyOn: 'Mọi layer đều đang bật.',
    turnedOn: 'Đã bật các layer'
  },
  laycur: {
    prompt: 'Chọn đối tượng cần chuyển sang layer hiện hành',
    currentLayerNotFound: 'Không tìm thấy layer hiện hành.',
    noObjects: 'Chưa chọn đối tượng hợp lệ nào.',
    alreadyCurrent: 'Các đối tượng đang chọn đã nằm trên layer hiện hành.',
    changed: 'Đã chuyển đối tượng sang layer hiện hành'
  },
  layfrz: {
    prompt: 'Chọn đối tượng nằm trên layer cần đóng băng hoặc',
    invalidSelection: 'Đối tượng đã chọn không hợp lệ.',
    settingsPrompt: 'Chọn thiết lập LAYFRZ cần đổi',
    viewportPrompt: 'Chọn cách xử lý đóng băng theo khung nhìn',
    blockSelectionPrompt: 'Chọn cách xử lý khi chọn trong block lồng nhau',
    vpfreezeFallback:
      'Trình xem hiện tại không hỗ trợ đóng băng layer theo từng khung nhìn; sẽ dùng cách đóng băng thường.',
    nestedSelectionLimited:
      'Thiết lập chọn trong block lồng nhau đã được lưu, nhưng thao tác chọn hiện vẫn lấy layer của đối tượng ở cấp trên cùng.',
    layerNotFound: 'Không tìm thấy layer',
    cannotFreezeCurrent: 'Không thể đóng băng layer hiện hành.',
    alreadyFrozen: 'Layer đã đóng băng sẵn',
    frozen: 'Đã đóng băng layer',
    restored: 'Đã khôi phục layer',
    nothingToUndo: 'Không có thao tác LAYFRZ nào để hoàn tác.',
    keywords: {
      settings: {
        display: 'Thiết lập(S)',
        local: 'Thiết lập',
        global: 'Settings'
      },
      undo: { display: 'Hoàn tác(U)', local: 'Hoàn tác', global: 'Undo' },
      viewports: {
        display: 'Khung nhìn(V)',
        local: 'Khung nhìn',
        global: 'Viewports'
      },
      blockSelection: {
        display: 'Chọn trong block(B)',
        local: 'Chọn trong block',
        global: 'BlockSelection'
      },
      freeze: { display: 'Đóng băng(F)', local: 'Đóng băng', global: 'Freeze' },
      vpfreeze: {
        display: 'Đóng băng khung nhìn(V)',
        local: 'Đóng băng khung nhìn',
        global: 'Vpfreeze'
      },
      block: { display: 'Block(B)', local: 'Block', global: 'Block' },
      entity: { display: 'Đối tượng(E)', local: 'Đối tượng', global: 'Entity' },
      none: { display: 'Không(N)', local: 'Không', global: 'None' }
    }
  },
  layiso: {
    prompt: 'Chọn đối tượng nằm trên layer cần tách riêng hoặc',
    settingsPrompt: 'Chọn thiết lập cho các layer không được tách riêng',
    offModePrompt: 'Chọn cách tắt các layer không được tách riêng',
    noLayers: 'Chưa chọn layer hợp lệ nào.',
    layerNotFound: 'Không tìm thấy layer',
    isolated: 'Đã tách riêng layer',
    affectedLayers: 'layer bị ảnh hưởng',
    vpfreezeFallback:
      'Trình xem hiện tại không hỗ trợ đóng băng layer theo từng khung nhìn; sẽ dùng cách tắt layer.',
    lockFadeFallback:
      'Trình xem hiện tại không hỗ trợ làm mờ layer; các layer không tách riêng sẽ bị khóa mà không làm mờ.',
    keywords: {
      settings: {
        display: 'Thiết lập(S)',
        local: 'Thiết lập',
        global: 'Settings'
      },
      off: { display: 'Tắt(O)', local: 'Tắt', global: 'Off' },
      lockAndFade: {
        display: 'Khóa và làm mờ(L)',
        local: 'Khóa và làm mờ',
        global: 'LockAndFade'
      },
      vpfreeze: {
        display: 'Đóng băng khung nhìn(V)',
        local: 'Đóng băng khung nhìn',
        global: 'Vpfreeze'
      }
    }
  },
  layuniso: {
    noPrevious: 'Không có trạng thái layer LAYISO nào trước đó để khôi phục.',
    layerNotFound: 'Không tìm thấy layer',
    nothingRestored: 'Không có thay đổi layer LAYISO nào được khôi phục.',
    restored: 'Đã khôi phục các layer'
  },
  laythw: {
    alreadyThawed: 'Mọi layer đều đã rã đông.',
    thawed: 'Đã rã đông các layer'
  },
  laylck: {
    prompt: 'Chọn một đối tượng nằm trên layer cần khóa',
    invalidSelection: 'Đối tượng đã chọn không hợp lệ.',
    layerNotFound: 'Không tìm thấy layer',
    alreadyLocked: 'Layer đã khóa sẵn',
    locked: 'Đã khóa layer'
  },
  layulk: {
    prompt: 'Chọn một đối tượng nằm trên layer cần mở khóa',
    invalidSelection: 'Đối tượng đã chọn không hợp lệ.',
    layerNotFound: 'Không tìm thấy layer',
    alreadyUnlocked: 'Layer đã mở khóa sẵn',
    unlocked: 'Đã mở khóa layer'
  },
  layoff: {
    prompt: 'Chọn đối tượng nằm trên layer cần tắt hoặc',
    invalidSelection: 'Đối tượng đã chọn không hợp lệ.',
    settingsPrompt: 'Chọn thiết lập LAYOFF cần đổi',
    viewportPrompt: 'Chọn cách xử lý theo khung nhìn',
    blockSelectionPrompt: 'Chọn cách xử lý khi chọn trong block lồng nhau',
    vpfreezeFallback:
      'Trình xem hiện tại không hỗ trợ tắt layer theo từng khung nhìn; sẽ dùng cách tắt thường.',
    nestedSelectionLimited:
      'Thiết lập chọn trong block lồng nhau đã được lưu, nhưng thao tác chọn hiện vẫn lấy layer của đối tượng ở cấp trên cùng.',
    layerNotFound: 'Không tìm thấy layer',
    cannotTurnOffCurrent: 'Không thể tắt layer hiện hành.',
    alreadyOff: 'Layer đã tắt sẵn',
    turnedOff: 'Đã tắt layer',
    restored: 'Đã khôi phục layer',
    nothingToUndo: 'Không có thao tác LAYOFF nào để hoàn tác.',
    keywords: {
      settings: {
        display: 'Thiết lập(S)',
        local: 'Thiết lập',
        global: 'Settings'
      },
      undo: { display: 'Hoàn tác(U)', local: 'Hoàn tác', global: 'Undo' },
      viewports: {
        display: 'Khung nhìn(V)',
        local: 'Khung nhìn',
        global: 'Viewports'
      },
      blockSelection: {
        display: 'Chọn trong block(B)',
        local: 'Chọn trong block',
        global: 'BlockSelection'
      },
      off: { display: 'Tắt(O)', local: 'Tắt', global: 'Off' },
      vpfreeze: {
        display: 'Đóng băng khung nhìn(V)',
        local: 'Đóng băng khung nhìn',
        global: 'Vpfreeze'
      },
      block: { display: 'Block(B)', local: 'Block', global: 'Block' },
      entity: { display: 'Đối tượng(E)', local: 'Đối tượng', global: 'Entity' },
      none: { display: 'Không(N)', local: 'Không', global: 'None' }
    }
  },
  layerp: {
    restored: 'Đã khôi phục trạng thái layer trước đó.',
    noPreviousState: 'Không có trạng thái layer nào trước đó để khôi phục.'
  },
  line: {
    firstPoint: 'Chọn điểm thứ nhất',
    firstPointOrContinue: 'Chọn điểm thứ nhất hoặc',
    nextPoint: 'Chọn điểm tiếp theo',
    nextPointWithOptions: 'Chọn điểm tiếp theo hoặc',
    keywords: {
      continue: { display: 'Vẽ tiếp(C)', local: 'Vẽ tiếp', global: 'Continue' },
      undo: { display: 'Hoàn tác(U)', local: 'Hoàn tác', global: 'Undo' },
      close: { display: 'Khép kín(C)', local: 'Khép kín', global: 'Close' }
    }
  },
  xline: {
    firstPointOrOptions: 'Chọn một điểm hoặc',
    secondPoint: 'Chọn điểm thứ hai',
    throughPoint: 'Chọn điểm đi qua',
    angle: 'Nhập góc của đường dựng hình',
    invalidDirection: 'Hướng không hợp lệ cho lệnh XLINE.',
    keywords: {
      hor: { display: 'Nằm ngang(H)', local: 'Nằm ngang', global: 'Hor' },
      ver: { display: 'Thẳng đứng(V)', local: 'Thẳng đứng', global: 'Ver' },
      ang: { display: 'Theo góc(A)', local: 'Theo góc', global: 'Ang' }
    }
  },
  ray: {
    startPoint: 'Chọn điểm đầu',
    throughPoint: 'Chọn điểm đi qua'
  },
  mline: {
    startPointWithOptions: 'Chọn điểm đầu hoặc',
    nextPointWithOptions: 'Chọn điểm tiếp theo hoặc',
    justificationPrompt: 'Chọn kiểu căn tuyến',
    scalePrompt: 'Nhập tỉ lệ multiline',
    stylePrompt: 'Nhập tên kiểu multiline hoặc [?] để xem danh sách',
    styleNotFound: 'Không tìm thấy kiểu multiline',
    styleListHeader: 'Các kiểu multiline đã nạp',
    styleListEmpty: 'Bản vẽ hiện tại chưa nạp kiểu multiline nào.',
    keywords: {
      justification: {
        display: 'Căn tuyến(J)',
        local: 'Căn tuyến',
        global: 'Justification'
      },
      scale: { display: 'Tỉ lệ(S)', local: 'Tỉ lệ', global: 'Scale' },
      style: { display: 'Kiểu(ST)', local: 'Kiểu', global: 'Style' },
      undo: { display: 'Hoàn tác(U)', local: 'Hoàn tác', global: 'Undo' },
      close: { display: 'Khép kín(C)', local: 'Khép kín', global: 'Close' },
      top: { display: 'Mép trên(T)', local: 'Mép trên', global: 'Top' },
      zero: { display: 'Tim(Z)', local: 'Tim', global: 'Zero' },
      bottom: { display: 'Mép dưới(B)', local: 'Mép dưới', global: 'Bottom' }
    }
  },
  measureAngle: {
    vertex: 'Chọn điểm đỉnh',
    arm1: 'Chọn một điểm trên cạnh thứ nhất',
    arm2: 'Chọn một điểm trên cạnh thứ hai'
  },
  measureArc: {
    startPoint: 'Chọn điểm đầu của cung',
    throughPoint: 'Chọn một điểm trên cung',
    endPoint: 'Chọn điểm cuối của cung'
  },
  measureArea: {
    firstPoint: 'Chọn điểm thứ nhất',
    nextPoint: 'Chọn điểm tiếp theo (hoặc nhấn Enter để kết thúc)'
  },
  measureDistance: {
    firstPoint: 'Chọn điểm thứ nhất',
    secondPoint: 'Chọn điểm thứ hai'
  },
  measurePoint: {
    point: 'Chọn điểm'
  },
  move: {
    basePointOrDisplacement: 'Chọn điểm chuẩn hoặc',
    secondPointOrDisplacement: 'Chọn điểm thứ hai hoặc',
    displacement: 'Nhập vectơ dời',
    keywords: {
      displacement: {
        display: 'Vectơ dời(D)',
        local: 'Vectơ dời',
        global: 'Displacement'
      }
    }
  },
  offset: {
    distance: 'Nhập khoảng cách offset',
    selectObject: 'Chọn đối tượng cần offset hoặc nhấn Enter để kết thúc',
    sidePoint: 'Chọn một điểm về phía cần offset',
    invalidDistance: 'Khoảng cách offset phải lớn hơn 0.',
    invalidSelection: 'Đối tượng đã chọn không offset được.',
    offsetFailed: 'Không tạo được đường offset về phía đã chọn.'
  },
  mtext: {
    point: 'Chọn điểm chèn chữ nhiều dòng'
  },
  pngout: {
    boundsFirstCorner: 'Chọn góc thứ nhất của vùng',
    boundsSecondCorner: 'Chọn góc đối diện',
    longSidePrompt: 'Nhập kích thước cạnh dài, tính bằng điểm ảnh'
  },
  imageattach: {
    insertionPoint: 'Chọn điểm chèn:',
    scale: 'Nhập hệ số tỉ lệ:',
    rotation: 'Nhập góc xoay:',
    invalidScale: 'Hệ số tỉ lệ phải lớn hơn 0.',
    decodeFailed: 'Không đọc được tệp ảnh đã chọn.'
  },
  insert: {
    blockName: 'Nhập tên block:',
    insertionPoint: 'Chọn điểm chèn:',
    scale: 'Nhập hệ số tỉ lệ:',
    rotation: 'Nhập góc xoay:',
    invalidScale: 'Hệ số tỉ lệ phải lớn hơn 0.',
    invalidBlockName: 'Tên block không hợp lệ.',
    blockNotFound: 'Không tìm thấy block',
    xrefNotAllowed: 'Không thể chèn tham chiếu ngoài bằng lệnh -INSERT.'
  },
  xattach: {
    insertionPoint: 'Chọn điểm chèn:',
    scale: 'Nhập hệ số tỉ lệ:',
    rotation: 'Nhập góc xoay:',
    invalidScale: 'Hệ số tỉ lệ phải lớn hơn 0.',
    unsupportedFile: 'Hãy chọn một tệp DWG hoặc DXF.',
    loading: 'Đang nạp tham chiếu ngoài...',
    loadFailed: 'Không đọc được tệp bản vẽ đã chọn.'
  },
  point: {
    point: 'Chọn một điểm'
  },
  polygon: {
    numberOfSides: 'Nhập số cạnh',
    centerOrEdge: 'Chọn tâm đa giác hoặc',
    radiusOrType: 'Chọn tùy chọn',
    edgeStart: 'Chọn đầu thứ nhất của cạnh',
    edgeEnd: 'Chọn đầu thứ hai của cạnh',
    keywords: {
      edge: { display: 'Theo cạnh(E)', local: 'Theo cạnh', global: 'Edge' },
      inscribed: {
        display: 'Nội tiếp đường tròn(I)',
        local: 'Nội tiếp đường tròn',
        global: 'Inscribed'
      },
      circumscribed: {
        display: 'Ngoại tiếp đường tròn(C)',
        local: 'Ngoại tiếp đường tròn',
        global: 'Circumscribed'
      }
    },
    invalid: {
      sides: 'Số cạnh không hợp lệ. Nhập một số nguyên từ 3 đến 1024.',
      radius: 'Bán kính không hợp lệ. Bán kính phải lớn hơn 0.',
      edge: 'Cạnh không hợp lệ. Chiều dài cạnh phải lớn hơn 0.'
    }
  },
  polyline: {
    firstPoint: 'Chọn điểm thứ nhất',
    nextPoint: 'Chọn điểm tiếp theo (hoặc nhấn Enter để kết thúc)',
    nextPointWithOptions: 'Chọn điểm tiếp theo hoặc',
    nextPointWithArcOptions: 'Chọn điểm tiếp theo hoặc',
    keywords: {
      arc: { display: 'Cung(A)', local: 'Cung', global: 'Arc' },
      undo: { display: 'Hoàn tác(U)', local: 'Hoàn tác', global: 'Undo' },
      close: { display: 'Khép kín(C)', local: 'Khép kín', global: 'Close' },
      line: { display: 'Đoạn thẳng(L)', local: 'Đoạn thẳng', global: 'Line' },
      angle: { display: 'Góc(A)', local: 'Góc', global: 'Angle' },
      center: { display: 'Tâm(C)', local: 'Tâm', global: 'Center' },
      secondPoint: {
        display: 'Điểm thứ hai(P)',
        local: 'Điểm thứ hai',
        global: 'SecondPoint'
      },
      radius: { display: 'Bán kính(R)', local: 'Bán kính', global: 'Radius' }
    },
    arcAngle: 'Nhập góc của cung',
    arcCenter: 'Chọn điểm tâm',
    arcSecondPoint: 'Chọn điểm thứ hai trên cung',
    arcEndPoint: 'Chọn điểm cuối của cung',
    arcRadius: 'Nhập bán kính cung'
  },
  rect: {
    firstPoint: 'Chọn điểm góc thứ nhất',
    nextPoint: 'Chọn điểm góc còn lại',
    firstPointWithOptions: 'Chọn điểm góc thứ nhất hoặc',
    otherCornerWithOptions: 'Chọn điểm góc còn lại hoặc',
    chamferFirst: 'Nhập khoảng vát thứ nhất',
    chamferSecond: 'Nhập khoảng vát thứ hai',
    filletRadius: 'Nhập bán kính bo góc',
    segmentWidth: 'Nhập bề rộng nét của hình chữ nhật',
    elevationValue: 'Nhập cao độ',
    thicknessValue: 'Nhập bề dày khối',
    rotationAngle: 'Nhập góc xoay của hình chữ nhật',
    dimensionLength: 'Nhập chiều dài hình chữ nhật',
    dimensionWidth: 'Nhập chiều rộng hình chữ nhật',
    areaValue: 'Nhập diện tích hình chữ nhật',
    areaLengthOrWidth: 'Nhập chiều dài hình chữ nhật',
    areaSpecifyWidth: 'Nhập chiều rộng hình chữ nhật',
    invalidPositive: 'Giá trị không hợp lệ. Hãy nhập một số lớn hơn 0.',
    invalidRect:
      'Không dựng được hình chữ nhật. Hãy chỉ định góc hoặc kích thước hợp lệ.',
    thicknessNotSupported:
      'Bề dày khối của hình chữ nhật hiện chưa được ghi vào dữ liệu đối tượng. Thiết lập bề dày bị bỏ qua.',
    keywords: {
      chamfer: { display: 'Vát góc(C)', local: 'Vát góc', global: 'Chamfer' },
      elevation: { display: 'Cao độ(E)', local: 'Cao độ', global: 'Elevation' },
      fillet: { display: 'Bo góc(F)', local: 'Bo góc', global: 'Fillet' },
      thickness: {
        display: 'Bề dày khối(T)',
        local: 'Bề dày khối',
        global: 'Thickness'
      },
      width: {
        display: 'Bề rộng nét(W)',
        local: 'Bề rộng nét',
        global: 'Width'
      },
      area: { display: 'Diện tích(A)', local: 'Diện tích', global: 'Area' },
      dimensions: {
        display: 'Kích thước(D)',
        local: 'Kích thước',
        global: 'Dimensions'
      },
      rotation: {
        display: 'Góc xoay(R)',
        local: 'Góc xoay',
        global: 'Rotation'
      },
      length: { display: 'Chiều dài(L)', local: 'Chiều dài', global: 'Length' },
      rectWidth: {
        display: 'Chiều rộng(W)',
        local: 'Chiều rộng',
        global: 'Width'
      }
    }
  },
  rotate: {
    basePoint: 'Chọn điểm chuẩn',
    rotationAngleOrOptions: 'Nhập góc xoay hoặc',
    referenceAngleOrPoints: 'Nhập góc tham chiếu hoặc',
    firstReferencePoint: 'Chọn điểm thứ nhất của góc tham chiếu',
    secondReferencePoint: 'Chọn điểm thứ hai',
    newAngle: 'Nhập góc mới',
    keywords: {
      copy: { display: 'Sao chép(C)', local: 'Sao chép', global: 'Copy' },
      reference: {
        display: 'Tham chiếu(R)',
        local: 'Tham chiếu',
        global: 'Reference'
      },
      points: { display: 'Theo điểm(P)', local: 'Theo điểm', global: 'Points' }
    },
    invalid: {
      referencePoints: 'Điểm tham chiếu không hợp lệ: hai điểm phải khác nhau.'
    }
  },
  sketch: {
    firstPoint: 'Chọn điểm thứ nhất',
    nextPoint: 'Chọn điểm cuối'
  },
  spline: {
    firstPoint: 'Chọn điểm thứ nhất',
    nextPoint: 'Chọn điểm tiếp theo (hoặc nhấn Enter để kết thúc)',
    firstPointWithOptions: 'Chọn điểm thứ nhất hoặc',
    nextPointWithFitOptions: 'Chọn điểm tiếp theo hoặc',
    nextPointWithCvOptions: 'Chọn điểm điều khiển tiếp theo hoặc',
    methodPrompt: 'Chọn cách dựng spline',
    knotsPrompt: 'Chọn cách tham số hóa nút',
    degreePrompt: 'Nhập bậc của spline',
    keywords: {
      method: { display: 'Cách dựng(M)', local: 'Cách dựng', global: 'Method' },
      fit: { display: 'Qua điểm(F)', local: 'Qua điểm', global: 'Fit' },
      cv: {
        display: 'Điểm điều khiển(C)',
        local: 'Điểm điều khiển',
        global: 'CV'
      },
      knots: { display: 'Nút(K)', local: 'Nút', global: 'Knots' },
      degree: { display: 'Bậc(D)', local: 'Bậc', global: 'Degree' },
      undo: { display: 'Hoàn tác(U)', local: 'Hoàn tác', global: 'Undo' },
      close: { display: 'Khép kín(C)', local: 'Khép kín', global: 'Close' },
      chord: { display: 'Dây cung(C)', local: 'Dây cung', global: 'Chord' },
      sqrtChord: {
        display: 'Căn dây cung(S)',
        local: 'Căn dây cung',
        global: 'SqrtChord'
      },
      uniform: { display: 'Đều(U)', local: 'Đều', global: 'Uniform' }
    }
  },
  sysvar: {
    prompt: 'Hãy nhập giá trị mới'
  },
  zoom: {
    mainPrompt: 'Chọn góc khung hoặc',
    firstCorner: 'Chọn góc thứ nhất',
    secondCorner: 'Chọn góc đối diện',
    centerPoint: 'Chọn điểm tâm',
    heightOrScale: 'Nhập chiều cao hoặc hệ số tỉ lệ (nX hoặc nXP)',
    scaleFactor: 'Nhập hệ số tỉ lệ (nX hoặc nXP)',
    keywords: {
      all: { display: 'Toàn bộ(A)', local: 'Toàn bộ', global: 'All' },
      center: { display: 'Tâm(C)', local: 'Tâm', global: 'Center' },
      extents: { display: 'Phạm vi(E)', local: 'Phạm vi', global: 'Extents' },
      previous: {
        display: 'Trước đó(P)',
        local: 'Trước đó',
        global: 'Previous'
      },
      scale: { display: 'Tỉ lệ(S)', local: 'Tỉ lệ', global: 'Scale' },
      window: { display: 'Khung(W)', local: 'Khung', global: 'Window' }
    }
  },
  chtml: {
    exportInvisibleLayers: 'Xuất cả layer đang ẩn',
    initialView: 'Khung nhìn ban đầu khi mở HTML',
    viewerMode: 'Chế độ trình xem ngoại tuyến',
    keywords: {
      yes: { display: 'Có(Y)', local: 'Có', global: 'Yes' },
      no: { display: 'Không(N)', local: 'Không', global: 'No' },
      extents: { display: 'Phạm vi(E)', local: 'Phạm vi', global: 'Extents' },
      current: { display: 'Hiện tại(C)', local: 'Hiện tại', global: 'Current' },
      view: { display: 'Xem(V)', local: 'Xem', global: 'View' },
      measure: { display: 'Đo(M)', local: 'Đo', global: 'Measure' }
    }
  }
}
