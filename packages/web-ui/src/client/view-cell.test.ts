import { describe, expect, test } from 'bun:test';
import { ViewCell } from './view-cell';

// Ячейка — источник вида: `get` со стабильной ссылкой, `subscribe` зовёт
// слушателя сразу текущим значением и затем на каждое новое; тот же объект
// не оповещает. Бросок слушателя уходит в `onFault`, остальные слушатели
// значение получают — как у `onChange` ядра.

type Value = { readonly n: number };

describe('ViewCell — значение и подписка', () => {
  test('get — начальное значение, та же ссылка', () => {
    const initial: Value = { n: 0 };
    const cell = new ViewCell(initial);

    expect(cell.get()).toBe(initial);
  });

  test('subscribe сразу вызывает слушателя текущим значением', () => {
    const initial: Value = { n: 0 };
    const cell = new ViewCell(initial);
    const seen: Value[] = [];

    cell.subscribe((value) => {
      seen.push(value);
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(initial);
  });

  test('set нового объекта — оповещение этим объектом, get его отдаёт', () => {
    const cell = new ViewCell<Value>({ n: 0 });
    const seen: Value[] = [];
    cell.subscribe((value) => {
      seen.push(value);
    });
    const next: Value = { n: 1 };

    cell.set(next);

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(next);
    expect(cell.get()).toBe(next);
  });

  test('set того же объекта — без оповещения', () => {
    const initial: Value = { n: 0 };
    const cell = new ViewCell(initial);
    const seen: Value[] = [];
    cell.subscribe((value) => {
      seen.push(value);
    });

    cell.set(initial);

    expect(seen).toHaveLength(1);
  });
});

describe('ViewCell — отписка', () => {
  test('после отписки оповещений нет; повторная отписка не трогает других', () => {
    const cell = new ViewCell<Value>({ n: 0 });
    const first: Value[] = [];
    const second: Value[] = [];
    const off = cell.subscribe((value) => {
      first.push(value);
    });
    cell.subscribe((value) => {
      second.push(value);
    });

    off();
    off();
    cell.set({ n: 1 });

    expect(first).toHaveLength(1);
    expect(second.map((value) => value.n)).toEqual([0, 1]);
  });

  test('отписка внутри оповещения не рвёт остальных слушателей', () => {
    const cell = new ViewCell<Value>({ n: 0 });
    const seen: string[] = [];
    let off = () => {};
    off = cell.subscribe((value) => {
      seen.push(`a${value.n}`);
      if (value.n === 1) off();
    });
    cell.subscribe((value) => {
      seen.push(`b${value.n}`);
    });
    cell.subscribe((value) => {
      seen.push(`c${value.n}`);
    });

    cell.set({ n: 1 });
    cell.set({ n: 2 });

    expect(seen).toEqual(['a0', 'b0', 'c0', 'a1', 'b1', 'c1', 'b2', 'c2']);
  });
});

describe('ViewCell — set из слушателя', () => {
  test('новый set во время рассылки прерывает старую: значения по порядку, все заканчивают на текущем', () => {
    const cell = new ViewCell<Value>({ n: 0 });
    const first: number[] = [];
    const second: number[] = [];
    cell.subscribe((value) => {
      first.push(value.n);
      if (value.n === 1) cell.set({ n: 2 });
    });
    cell.subscribe((value) => {
      second.push(value.n);
    });

    cell.set({ n: 1 });

    expect(first).toEqual([0, 1, 2]);
    expect(second).toEqual([0, 2]);
    expect(cell.get()).toEqual({ n: 2 });
  });
});

describe('ViewCell — возврат к прежнему объекту из слушателя', () => {
  test('set(B), затем set(A) во время рассылки A — устаревшая рассылка прерывается, повторов подряд нет', () => {
    const a: Value = { n: 1 };
    const b: Value = { n: 2 };
    const cell = new ViewCell<Value>({ n: 0 });
    let bounced = false;
    cell.subscribe((value) => {
      if (value === a && !bounced) {
        bounced = true;
        cell.set(b);
        cell.set(a);
      }
    });
    const second: Value[] = [];
    cell.subscribe((value) => {
      second.push(value);
    });

    cell.set(a);

    expect(second.map((value) => value.n)).toEqual([0, 2, 1]);
    expect(second.at(-1)).toBe(a);
  });
});

describe('ViewCell — бросок слушателя', () => {
  test('бросок при вызове сразу в subscribe — в onFault, подписка жива', () => {
    const faults: unknown[] = [];
    const cell = new ViewCell<Value>({ n: 0 }, (error) => {
      faults.push(error);
    });
    const boom = new Error('слушатель упал');
    const seen: number[] = [];

    expect(() =>
      cell.subscribe((value) => {
        seen.push(value.n);
        if (value.n === 0) throw boom;
      }),
    ).not.toThrow();
    cell.set({ n: 1 });

    expect(faults).toEqual([boom]);
    expect(seen).toEqual([0, 1]);
  });

  test('бросок — в onFault, следующий слушатель значение получил', () => {
    const faults: unknown[] = [];
    const cell = new ViewCell<Value>({ n: 0 }, (error) => {
      faults.push(error);
    });
    const boom = new Error('слушатель упал');
    cell.subscribe((value) => {
      if (value.n === 1) throw boom;
    });
    const seen: number[] = [];
    cell.subscribe((value) => {
      seen.push(value.n);
    });

    expect(() => cell.set({ n: 1 })).not.toThrow();

    expect(faults).toEqual([boom]);
    expect(seen).toEqual([0, 1]);
    expect(cell.get()).toEqual({ n: 1 });
  });
});
