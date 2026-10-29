import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  suggestDiagramNames,
  type DiagramNameCatalog,
  type DiagramSearchMode,
  type DiagramSuggestionKind,
} from '../diagramSearch';

const KIND_LABEL: Record<DiagramSuggestionKind, string> = {
  capability: 'Capability',
  application: 'Application',
  organization: 'Organization',
  information: 'Information',
  pattern: 'Pattern',
  crud: 'CRUD',
};

type DiagramSearchProps = {
  terms: string[];
  draft: string;
  onDraft: (value: string) => void;
  onCommit: (text: string) => void;
  onRemove: (index: number) => void;
  mode: DiagramSearchMode;
  catalog: DiagramNameCatalog;
  placeholder: string;
};

export const DiagramSearch = ({
  terms,
  draft,
  onDraft,
  onCommit,
  onRemove,
  mode,
  catalog,
  placeholder,
}: DiagramSearchProps) => {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(
    () => suggestDiagramNames(mode, draft, terms, catalog),
    [mode, draft, terms, catalog],
  );
  const listOpen = open && suggestions.length > 0;
  const applied = terms.length > 0 || draft.trim().length > 0;

  useEffect(() => {
    setActiveIndex(-1);
    setOpen(draft.trim().length >= 1);
  }, [draft]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const commitHighlighted = () => {
    if (listOpen && activeIndex >= 0 && suggestions[activeIndex]) onCommit(suggestions[activeIndex].label);
    else onCommit(draft);
  };

  return (
    <div className="diagram-keyword-search" ref={rootRef}>
      <div
        className={`diagram-keyword-box${applied ? ' filter-applied' : ''}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <Search size={16} className="diagram-keyword-icon" aria-hidden="true" />
        {terms.map((term, index) => (
          <span className="diagram-keyword-chip" key={`${term.toLowerCase()}-${index}`}>
            <span>{term}</span>
            <button type="button" aria-label={`Remove ${term}`} onClick={() => onRemove(index)}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="diagram-keyword-input"
          role="combobox"
          aria-label="Diagram search"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-activedescendant={listOpen && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          value={draft}
          placeholder={terms.length > 0 ? 'Add keyword...' : placeholder}
          onChange={(event) => onDraft(event.target.value)}
          onFocus={() => {
            if (draft.trim().length >= 1) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (suggestions.length === 0) return;
              setOpen(true);
              setActiveIndex((current) => {
                if (!listOpen) return event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
                if (event.key === 'ArrowDown') return current >= suggestions.length - 1 ? 0 : current + 1;
                return current <= 0 ? suggestions.length - 1 : current - 1;
              });
              return;
            }
            if (event.key === 'Escape') {
              if (listOpen) {
                event.preventDefault();
                setOpen(false);
                setActiveIndex(-1);
              }
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              commitHighlighted();
              return;
            }
            if (event.key === 'Backspace' && draft === '' && terms.length > 0) {
              event.preventDefault();
              onRemove(terms.length - 1);
            }
          }}
        />
      </div>
      {listOpen && (
        <ul className="diagram-keyword-list" id={listId} role="listbox" aria-label="Diagram search suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.kind}-${suggestion.label}`} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-opt-${index}`}
                className="diagram-keyword-option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onCommit(suggestion.label)}
              >
                <span>{suggestion.label}</span>
                <span className="diagram-keyword-kind">{KIND_LABEL[suggestion.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
