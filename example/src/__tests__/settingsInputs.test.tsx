import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useLayoutEffect, type ComponentProps, type ReactNode } from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { HexColorSetting } from '../components/settings/HexColorSetting';
import { NumberSetting } from '../components/settings/NumberSetting';
import { AppThemeProvider } from '../themeContext';

function CommitObserver({
  children,
  onCommit,
}: {
  children: ReactNode;
  onCommit: () => void;
}) {
  useLayoutEffect(onCommit);
  return children;
}

describe('settings input drafts', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  const input = () => {
    // SAFETY: both settings render a TextInput and NumberSetting's commit has no arguments.
    return renderer!.root.findByType(TextInput).props as ComponentProps<
      typeof TextInput
    > & {
      onEndEditing: () => void;
    };
  };

  it('resets number drafts and errors before committing an external value', () => {
    const committed: Array<ComponentProps<typeof TextInput>> = [];
    const onValueChange = jest.fn();
    const tree = (value: number) => (
      <AppThemeProvider mode="dark">
        <CommitObserver
          onCommit={() => {
            committed.push(input());
          }}
        >
          <NumberSetting
            label="Period"
            description="Period"
            value={value}
            integer
            onValueChange={onValueChange}
          />
        </CommitObserver>
      </AppThemeProvider>
    );
    act(() => {
      renderer = create(tree(20));
    });
    const nativeInput = renderer!.root.findByType(TextInput);
    act(() => {
      input().onChangeText?.('0');
    });
    act(() => input().onEndEditing());
    expect(input().accessibilityValue?.text).toBeDefined();
    expect(onValueChange).not.toHaveBeenCalled();

    committed.length = 0;
    act(() => renderer!.update(tree(50)));
    expect(committed[0]?.value).toBe('50');
    expect(committed[0]?.accessibilityValue).toBeUndefined();
    expect(renderer!.root.findByType(TextInput)).toBe(nativeInput);

    act(() => {
      input().onChangeText?.('12');
    });
    act(() => renderer!.update(tree(50)));
    expect(input().value).toBe('12');
    act(() => renderer!.update(tree(20)));
    expect(input().value).toBe('20');
  });

  it('keeps the color input mounted across valid edits and resets incomplete drafts', () => {
    const committed: Array<string | undefined> = [];
    const onValueChange = jest.fn();
    const tree = (value: string) => (
      <AppThemeProvider mode="dark">
        <CommitObserver
          onCommit={() => {
            committed.push(input().value);
          }}
        >
          <HexColorSetting
            label="Color"
            value={value}
            onValueChange={onValueChange}
          />
        </CommitObserver>
      </AppThemeProvider>
    );
    act(() => {
      renderer = create(tree('#112233'));
    });
    const nativeInput = renderer!.root.findByType(TextInput);
    act(() => {
      input().onChangeText?.('#abcdef');
    });
    expect(onValueChange).toHaveBeenLastCalledWith('#ABCDEF');
    act(() => renderer!.update(tree('#ABCDEF')));
    expect(renderer!.root.findByType(TextInput)).toBe(nativeInput);
    act(() => {
      input().onChangeText?.('#ABCDEF80');
    });
    expect(onValueChange).toHaveBeenLastCalledWith('#ABCDEF80');
    act(() => renderer!.update(tree('#ABCDEF80')));
    expect(renderer!.root.findByType(TextInput)).toBe(nativeInput);

    act(() => {
      input().onChangeText?.('#AB');
    });
    expect(input().accessibilityValue?.text).toBe('Invalid color');
    act(() => renderer!.update(tree('#ABCDEF80')));
    expect(input().value).toBe('#AB');
    committed.length = 0;
    act(() => renderer!.update(tree('#112233')));
    expect(committed[0]).toBe('#112233');
    expect(input().accessibilityValue).toBeUndefined();
    expect(renderer!.root.findByType(TextInput)).toBe(nativeInput);
  });
});
