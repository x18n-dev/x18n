import { describe, expect, it } from 'vitest'
import { planArrayDelete } from '../src'

// `empty[i]` is true when item i holds an empty message. T and F below are those flags.
const T = true
const F = false

describe('planArrayDelete', () => {
  describe('an item in the middle', () => {
    it('is emptied and keeps its index, while a later item still holds a message', () => {
      expect(planArrayDelete([F, F, F], 1)).toEqual({ kind: 'empty' })
    })

    it('is emptied when the empty items before it are not next to the end', () => {
      expect(planArrayDelete([T, F, F, F], 2)).toEqual({ kind: 'empty' })
    })

    it('stays empty when it was empty already', () => {
      expect(planArrayDelete([F, T, F], 1)).toEqual({ kind: 'empty' })
    })

    it('goes with the empty items after it, as nothing is left to hold the index', () => {
      expect(planArrayDelete([F, F, T, T], 1)).toEqual({ kind: 'truncate', from: 1 })
    })
  })

  describe('the last item', () => {
    it('is cut off', () => {
      expect(planArrayDelete([F, F, F], 2)).toEqual({ kind: 'truncate', from: 2 })
    })

    it('takes the empty items right before it', () => {
      expect(planArrayDelete([F, F, T, T, F], 4)).toEqual({ kind: 'truncate', from: 2 })
    })

    it('stops at the first item that holds a message', () => {
      // Items 0 and 2 are empty. Deleting 3 removes 2 and 3 and leaves 0 where it is.
      expect(planArrayDelete([T, F, T, F], 3)).toEqual({ kind: 'truncate', from: 2 })
    })

    it('does not take an empty item that is not next to it', () => {
      expect(planArrayDelete([T, T, F, F], 3)).toEqual({ kind: 'truncate', from: 3 })
    })
  })

  describe('the whole array', () => {
    it('goes when its only item is deleted', () => {
      expect(planArrayDelete([F], 0)).toEqual({ kind: 'truncate', from: 0 })
    })

    it('goes when the last message is deleted and only empty items are left before it', () => {
      expect(planArrayDelete([T, T, F], 2)).toEqual({ kind: 'truncate', from: 0 })
    })

    it('goes when every other item is empty already', () => {
      expect(planArrayDelete([T, F, T], 1)).toEqual({ kind: 'truncate', from: 0 })
    })
  })

  describe('an index outside the array', () => {
    it.each([
      [
        'past the end',
        [F, F],
        2,
      ],
      [
        'far past the end',
        [F, F],
        99,
      ],
      [
        'below zero',
        [F, F],
        -1,
      ],
      ['in an empty array', [], 0],
    ])('does nothing %s', (_name, empty, index) => {
      expect(planArrayDelete(empty, index)).toEqual({ kind: 'none' })
    })

    it('does nothing for an index that is not a whole number', () => {
      expect(planArrayDelete([F, F], 0.5)).toEqual({ kind: 'none' })
    })
  })

  it('does not change the flags it is given', () => {
    const empty = [T, F, T, F]
    planArrayDelete(empty, 3)
    expect(empty).toEqual([T, F, T, F])
  })
})
