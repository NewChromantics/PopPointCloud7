import Pop from './PopEngine/PopEngine.js'
import {GetNextPowerOf2,IsPositionInsideBox3} from './PopEngine/Math.js'
import Octree_t from './PopEngine/Octree.js'


const DoBruteForceGeneration = true;
const OctreeMaxRecursions = 7;

async function ManuallyAddPositionsToOctree(Positions,Octree)
{
	function ShouldSplit(BoundingBox)
	{
		function IsPositionInside(xyz)
		{
			return IsPositionInsideBox3( xyz, BoundingBox.Min, BoundingBox.Max );
		}
		const First = Positions.find( IsPositionInside );
		if ( !First )
			return 'Empty';
		return true;
	}
	
	await Octree.SplitRecursive( ShouldSplit, OctreeMaxRecursions );
}


function XyzsFromImage(Image)
{
	const Channels = Image.GetChannels();
	let Pixels = Image.GetPixelBuffer();
	if ( Pixels.Data )
		Pixels = Pixels.Data;
	const Xyzs = [];
	for ( let i=0;	i<Pixels.length;	i+=Channels )
	{
		if ( Channels == 4 )
		{
			const w = Pixels[i+3];
			if ( w == 0 )
				continue;
		}
		const xyz = Pixels.subarray( i,i+3);
		Xyzs.push(xyz);
	}
	return Xyzs;
}

export default async function PositionsToOctree(Positions,PositionToWorldTransform,RenderContext)
{
	if ( !(Positions instanceof Pop.Image ) )
		throw `Currently require Positions to be a pop image not ${typeof Positions}`;
	
	
	if ( DoBruteForceGeneration )
	{
		const Bounds = {};
		Bounds.Min = [-5,-5,-10];
		Bounds.Max = [5,5,0];
		const Octree = new Octree_t(null,Bounds);
		const Xyzs = XyzsFromImage(Positions);
		ManuallyAddPositionsToOctree( Xyzs, Octree );
		return Octree;
	}
	
	//	if we knew the total bounds, we could do a better resolution/granuality
	//	mip map by choosing thinnest for depth, or wider than taller etc
	//	maybe expand this to two passes; one for a rough but faster to
	//	get total bounds
	//	todo: option to output different mip levels in an image
	
	let LargestSize = GetNextPowerOf2(512);//xN
	let Sizes = [];
	for ( let Size=1;	Size<=LargestSize;	Size*=2 )
	{
		Sizes.push( [Size,Size] );
	}
	
	let InvalidRgba = new Float32Array(new Array(LargestSize*LargestSize)).fill([0,0,0,0]);
	
	//	gr: I think we need 3 buffers, one for each axis
	//		we can then do rgb-min and alpha-max blend to get min/max for each
	//		could MRT that
	//	we could also do my x/y and z-bits system, but we need a size first...
	let MapMin = new Pop.Image(`Map ${LargestSize}`);
	//MapMin.WritePixels(LargestSize,LargestSize
	
	
	
}
