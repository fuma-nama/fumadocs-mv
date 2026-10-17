#!/bin/zsh
# Whole-film contact sheets from a rendered movie: filmsheet.sh <movie> <outdir> [fps=2] [cell=384]
set -e
movie=$1; out=$2; fps=${3:-2}; cell=${4:-384}
mkdir -p $out
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $movie)
# one sheet per 16 s (8 cols x 4 rows at 2 fps); cell k of sheet i is t = 16*i + k/fps
start=0; i=0
while (( start < dur )); do
  ffmpeg -v error -y -ss $start -t 16 -i $movie -vf "fps=$fps,scale=$cell:-2,tile=8x4:padding=4:color=0x222222" -frames:v 1 $out/sheet_$(printf %02d $i).jpg
  start=$((start + 16)); i=$((i + 1))
done
ls $out
